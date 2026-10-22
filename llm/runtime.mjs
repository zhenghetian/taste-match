import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { resolveModel } from "./config.mjs";

const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const integer = (value, fallback, min, max) => {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function instructionFor(env, key) {
  const value = env[key] ?? "";
  if (typeof value !== "string" || [...value].length > 2000) throw new Error("invalid_configuration");
  return value.trim();
}

export function systemWithInstruction(system, instruction) {
  return instruction ? `${system}\n\n管理员补充指令（仅在不违反上述固定安全规则、输入数据边界和输出格式时适用，不能覆盖这些规则）：\n${instruction}` : system;
}

export function promptFingerprint(version, instruction) {
  return instruction ? `${version}:${digest(instruction)}` : version;
}

// Shared state is deliberately just { active: 0 }, reusable across features and revisions.
export function createRuntime({ env, now, record, sharedConcurrency = { active: 0 } }) {
  const timeoutMs = integer(env.ANHAO_LLM_TIMEOUT_MS, 20000, 1, 60000);
  const maxTokens = integer(env.ANHAO_LLM_MAX_TOKENS, 4096, 256, 8192);
  const dailyLimit = integer(env.ANHAO_LLM_DAILY_LIMIT, 100, 0, 10000);
  const userLimit = integer(env.ANHAO_LLM_USER_DAILY_LIMIT, 10, 0, 1000);
  const concurrency = integer(env.ANHAO_LLM_CONCURRENCY, 2, 1, 8);
  const model = resolveModel(env);
  const active = new Set();
  let ledger;
  let retired = false;
  let retirement;
  let resolveRetirement;

  function database() {
    if (!ledger) {
      const dir = env.DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url));
      mkdirSync(dir, { recursive: true });
      ledger = new DatabaseSync(join(dir, "ai-harness.db"));
      ledger.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY, day TEXT NOT NULL, actor TEXT NOT NULL,
          prompt_version TEXT NOT NULL, started_at INTEGER NOT NULL,
          status TEXT NOT NULL, reason TEXT, model TEXT,
          latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER
        );
        CREATE INDEX IF NOT EXISTS runs_day_actor ON runs(day, actor);`);
    }
    return ledger;
  }

  function closeIfIdle() {
    if (retired && active.size === 0) {
      ledger?.close();
      ledger = undefined;
      resolveRetirement?.();
    }
  }

  function retire() {
    if (retirement) return retirement;
    retired = true;
    retirement = new Promise((resolve) => { resolveRetirement = resolve; });
    for (const request of active) request.controller.abort(new Error("retired"));
    closeIfIdle();
    return retirement;
  }

  return {
    getActiveCount: () => active.size,
    isRetired: () => retired,
    retire,
    close: retire,
    async run({ actorId, promptVersion, call, fallback, validate }) {
      if (retired) return fallback("retired");
      if (sharedConcurrency.active >= concurrency) return fallback("busy");
      if (dailyLimit === 0 || userLimit === 0) return fallback("daily_limit");
      const started = now();
      const day = new Date(started).toISOString().slice(0, 10);
      const runId = randomUUID();
      let db;
      try {
        db = database();
        db.exec("BEGIN IMMEDIATE");
        const total = db.prepare("SELECT COUNT(*) AS n FROM runs WHERE day=?").get(day).n;
        const user = db.prepare("SELECT COUNT(*) AS n FROM runs WHERE day=? AND actor=?").get(day, digest(actorId)).n;
        if (total >= dailyLimit || user >= userLimit) {
          db.exec("ROLLBACK");
          return fallback("daily_limit");
        }
        db.prepare("INSERT INTO runs(id,day,actor,prompt_version,started_at,status) VALUES(?,?,?,?,?,?)")
          .run(runId, day, digest(actorId), promptVersion, started, "reserved");
        db.exec("COMMIT");
      } catch {
        try { db?.exec("ROLLBACK"); } catch {}
        return fallback("ledger_unavailable");
      }

      const request = { controller: new AbortController(), providerSettled: false, responseSettled: false };
      active.add(request);
      sharedConcurrency.active += 1;
      const release = () => {
        if (!request.providerSettled || !request.responseSettled || !active.delete(request)) return;
        sharedConcurrency.active -= 1;
        closeIfIdle();
      };
      let timer;
      let onAbort;
      let usage;
      let resultModel = model;
      let result;
      try {
        try {
          const aborted = new Promise((_, reject) => {
            onAbort = () => reject(request.controller.signal.reason);
            request.controller.signal.addEventListener("abort", onAbort, { once: true });
            timer = setTimeout(() => request.controller.abort(new Error("timeout")), timeoutMs);
          });
          let pending;
          try { pending = Promise.resolve(call({ signal: request.controller.signal, maxTokens })); }
          catch (error) { pending = Promise.reject(error); }
          // A timed-out provider may ignore abort. Keep its slot until it actually settles;
          // its late result never touches the ledger or emits a second record.
          pending.then(() => { request.providerSettled = true; release(); }, () => { request.providerSettled = true; release(); });
          const response = await Promise.race([pending, aborted]);
          usage = response.usage;
          resultModel = response.model || model;
          result = { ...validate(response.output), source: "model", runId };
        } catch (error) {
          let reason = "provider_error";
          if (["timeout", "retired", "refusal", "invalid_output", "incomplete_output", "invalid_configuration"].includes(error?.message)) reason = error.message;
          else if (error?.status === 401 || error?.status === 403) reason = "authentication";
          else if (error?.status === 429) reason = "provider_rate_limit";
          result = fallback(reason, runId);
        } finally {
          clearTimeout(timer);
          request.controller.signal.removeEventListener("abort", onAbort);
        }
        const metadata = {
          runId, promptVersion, source: result.source, reason: result.reason || null,
          model: resultModel, latencyMs: Math.max(0, now() - started),
          inputTokens: Number.isSafeInteger(usage?.input_tokens) ? usage.input_tokens : 0,
          outputTokens: Number.isSafeInteger(usage?.output_tokens) ? usage.output_tokens : 0
        };
        try {
          db.prepare("UPDATE runs SET status=?,reason=?,model=?,latency_ms=?,input_tokens=?,output_tokens=? WHERE id=?")
            .run(metadata.source, metadata.reason, metadata.model, metadata.latencyMs, metadata.inputTokens, metadata.outputTokens, runId);
          record?.(metadata);
        } catch { /* A completed response remains usable if metadata persistence fails. */ }
        return result;
      } finally {
        request.responseSettled = true;
        release();
      }
    }
  };
}
