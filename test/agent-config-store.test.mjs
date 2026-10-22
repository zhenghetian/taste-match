import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentConfigStore } from "../agent-config.mjs";

const env = { NODE_ENV: "production", ANHAO_LLM_ENABLED: "false", ANHAO_LLM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "synthetic-private-key", ADMIN_KEY: "synthetic-admin-key" };
function fixture() {
  const db = new DatabaseSync(":memory:");
  return { db, store: createAgentConfigStore({ db, env }) };
}

test("agent settings revisions are persistent, optimistic and restorable without credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "anhao-agent-config-"));
  let db = new DatabaseSync(join(dir, "config.db"));
  try {
    let store = createAgentConfigStore({ db, env });
    const initial = store.snapshot();
    assert.equal(initial.revision, 1);
    assert.equal(initial.credentials.deepseek, true);
    assert.equal(initial.configuration.connectionVerified, false);
    const settings = { ...initial.settings, enabled: true, globalDailyLimit: 0, autoInstruction: "语气简短" };
    const saved = store.save({ expectedRevision: initial.revision, settings, reason: "调整合成配置" });
    assert.equal(saved.revision, 2);
    assert.equal(saved.settings.globalDailyLimit, 0);
    assert.equal(store.runtimeEnv().ANHAO_LLM_DAILY_LIMIT, "0");
    assert.equal(store.runtimeEnv().ANHAO_LLM_AUTO_INSTRUCTION, "语气简短");
    assert.equal(store.runtimeEnv().DEEPSEEK_API_KEY, env.DEEPSEEK_API_KEY);
    assert.throws(() => store.save({ expectedRevision: 1, settings, reason: "过时更新" }), { status: 409, code: "CONFIG_CONFLICT" });
    assert.equal(store.history().length, 2);
    const restored = store.rollback({ expectedRevision: 2, revision: 1, reason: "恢复初始配置" });
    assert.equal(restored.revision, 3);
    assert.deepEqual(restored.settings, initial.settings);
    assert.equal(store.history()[0].restoredFrom, 1);
    const serialized = JSON.stringify([store.snapshot(), store.history(), db.prepare("SELECT * FROM agent_config_revisions").all()]);
    for (const value of [env.DEEPSEEK_API_KEY, env.ADMIN_KEY]) assert.equal(serialized.includes(value), false);
    db.close();
    db = new DatabaseSync(join(dir, "config.db"));
    store = createAgentConfigStore({ db, env: { ...env, ANHAO_LLM_MODEL: "different-env-default" } });
    assert.equal(store.snapshot().revision, 3);
    assert.deepEqual(store.snapshot().settings, initial.settings);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("agent settings reject extra fields, unsafe ranges and stored credential patterns", () => {
  const { db, store } = fixture();
  try {
    const settings = store.snapshot().settings;
    const invalid = [
      { ...settings, endpoint: "https://example.com" }, { ...settings, apiKey: "anything" },
      { ...settings, concurrency: 0 }, { ...settings, concurrency: 9 },
      { ...settings, timeoutMs: 0 }, { ...settings, maxTokens: 9000 },
      { ...settings, globalDailyLimit: -1 }, { ...settings, userDailyLimit: 1.5 },
      { ...settings, enabled: "true" }, { ...settings, provider: "other" },
      { ...settings, model: "model\nignore" }, { ...settings, replyInstruction: "x".repeat(2001) },
      { ...settings, autoInstruction: "sk-" + "a".repeat(32) }
    ];
    for (const value of invalid) {
      assert.equal(store.validate(value).valid, false);
      assert.throws(() => store.save({ expectedRevision: 1, settings: value, reason: "合成修改" }), { status: 400 });
    }
    assert.equal(store.snapshot().revision, 1);
    assert.equal(store.validate({ ...settings, model: "", globalDailyLimit: 0, userDailyLimit: 0 }).valid, true);
    assert.throws(() => store.save({ expectedRevision: 1, settings, reason: " " }), { status: 400 });
    assert.throws(() => store.rollback({ expectedRevision: 1, revision: 999, reason: "不存在" }), { status: 404 });
  } finally { db.close(); }
});

test("enabled settings require independent cloud credentials, disabled settings remain editable", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = createAgentConfigStore({ db, env: { NODE_ENV: "production", ANTHROPIC_BASE_URL: "http://127.0.0.1:9000" } });
    const settings = store.snapshot().settings;
    assert.equal(store.validate(settings).valid, true);
    const validation = store.validate({ ...settings, enabled: true });
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.includes("local_endpoint"));
    assert.ok(validation.issues.includes("missing_cloud_credential"));
    assert.equal(store.snapshot().configuration.connectionVerified, false);
  } finally { db.close(); }
});
