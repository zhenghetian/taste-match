import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";

const dataDir = mkdtempSync(join(tmpdir(), "anhao-agent-admin-"));
Object.assign(process.env, {
  DATA_DIR: dataDir, NODE_ENV: "production", ADMIN_KEY: "synthetic-admin-key",
  BETA_TEST_CODE: "123456", ANHAO_LLM_ENABLED: "false", ANHAO_LLM_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "synthetic-deepseek-key", ANTHROPIC_API_KEY: "synthetic-anthropic-key",
  ANTHROPIC_AUTH_TOKEN: "", ANTHROPIC_BASE_URL: "", ANHAO_LLM_MODEL: "deepseek-chat",
  ANHAO_LLM_AUTO_REPLY_ENABLED: "true", ANHAO_LLM_CLOUD_MODE: "true",
  PUBLIC_URL: "https://synthetic.example", SMS_WEBHOOK_URL: "", MODERATION_WEBHOOK_URL: ""
});
let server, base, serial = 0;
let rejectCandidate = false;
const instances = [], calls = [];
function harnessFactory({ env, sharedConcurrency }) {
  if (rejectCandidate) throw Object.assign(new Error("synthetic initialization failure"), { status: 503, code: "SYNTHETIC_INIT_FAILURE" });
  const instance = { env, sharedConcurrency, retired: false };
  const harness = feature => ({
    status: () => ({ enabled: env.ANHAO_LLM_ENABLED === "true", feature }),
    close() { instance.retired = true; },
    retire() { instance.retired = true; },
    suggest(input) {
      return new Promise(resolve => {
        const call = { instance, feature, input, settled: false, finish(result = {}) {
          if (call.settled) return;
          call.settled = true;
          resolve({ source: "model", draft: "合成有效回复", suggestions: ["合成开场白"], ...result });
        } };
        calls.push(call);
      });
    }
  });
  instances.push(instance);
  return { icebreakerHarness: harness("icebreakers"), replyDraftHarness: harness("replyDrafts") };
}
async function start() {
  const url = new URL("../server.mjs", import.meta.url);
  url.searchParams.set("admin-test", String(++serial));
  const { createServer } = await import(url.href);
  server = createServer({ harnessFactory });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function request(path, { method = "GET", body, token, admin = true, origin, status = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json", ...(admin ? { "x-admin-key": "synthetic-admin-key" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin === undefined ? {} : { origin }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000)
  });
  const text = await response.text();
  const payload = JSON.parse(text);
  assert.equal(response.status, status, `${method} ${path}: ${text}`);
  if (path.startsWith("/api/admin/agent")) assert.equal(response.headers.get("cache-control"), "no-store");
  return payload;
}
const config = () => request("/api/admin/agent/config");
async function save(patch, options = {}) {
  const current = await config();
  return request("/api/admin/agent/config", { method: "PUT", body: { expectedRevision: current.revision,
    settings: { ...current.settings, ...patch }, reason: "合成管理操作" }, ...options });
}
async function eventually(read, accept = Boolean) {
  const deadline = Date.now() + 3000;
  do {
    const value = await read();
    if (accept(value)) return value;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail("expected asynchronous synthetic state");
}
async function register() {
  const phone = `13577${String(++serial).padStart(6, "0")}`;
  await request("/api/auth/send-code", { method: "POST", body: { phone } });
  return request("/api/auth/verify", { method: "POST", body: { phone, code: "123456" } });
}
async function room() {
  const owner = await register(), peer = await register();
  const { invite } = await request("/api/friends/invite", { token: owner.token });
  const { friendship } = await request("/api/friends/join", { token: peer.token, method: "POST", body: { code: invite.code }, status: 201 });
  return { owner, peer, agent: `/api/agent/threads/friend/${friendship.id}`,
    messages: `/api/friends/${owner.user.id}/messages`, threadKey: `friend:${friendship.id}` };
}
async function incoming(room, body = "一条合成消息") {
  return request(room.messages, { token: room.peer.token, method: "POST", body: { body }, status: 201 });
}
async function enable(room, mode = "auto") {
  return request(`${room.agent}/enable`, { token: room.owner.token, method: "POST", body: { mode, consent: true } });
}
const state = room => request(room.agent, { token: room.owner.token });
const nextCall = (room, after = 0) => eventually(() => calls.slice(after).find(call => call.input.threadKey === room.threadKey));
async function finish(call, result) {
  call.finish(result);
  await nextTurn(); await nextTurn();
}

test.before(start);
test.afterEach(async () => {
  for (const call of calls) if (!call.settled) call.finish({ source: "fallback", reason: "disabled" });
  await nextTurn(); await nextTurn();
});
test.after(async () => {
  await stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test("admin endpoints require existing key and return no-store, method and path errors", async () => {
  for (const [path, method] of [["config", "GET"], ["config", "PUT"], ["validate", "POST"], ["history", "GET"], ["rollback", "POST"], ["status", "GET"]]) {
    const result = await request(`/api/admin/agent/${path}`, { method, admin: false, status: 401 });
    assert.equal(result.error.code, "ADMIN_AUTH_REQUIRED");
  }
  assert.equal((await request("/api/admin/agent/unknown", { status: 404 })).error.code, "NOT_FOUND");
  assert.equal((await request("/api/admin/agent/config", { method: "DELETE", status: 405 })).error.code, "METHOD_NOT_ALLOWED");
});

test("config, validation and status expose no credentials or chat content", async () => {
  const current = await config();
  assert.equal(current.settings.enabled, false);
  assert.deepEqual(current.credentials, { anthropic: true, deepseek: true });
  assert.equal(current.configuration.connectionVerified, false);
  const valid = await request("/api/admin/agent/validate", { method: "POST", body: { settings: current.settings } });
  assert.equal(valid.valid, true);
  const status = await request("/api/admin/agent/status");
  assert.equal(status.revision, current.revision);
  assert.equal(status.activeJobs, 0);
  assert.match(status.usage.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(status.usage.globalCount, 0, "absent temporary ledger means no recorded runs");
  const text = JSON.stringify({ current, valid, status });
  for (const secret of ["synthetic-admin-key", "synthetic-deepseek-key", "synthetic-anthropic-key"]) assert.equal(text.includes(secret), false);
  for (const injected of [{ apiKey: "forbidden" }, { baseUrl: "https://evil.example" }, { ANTHROPIC_API_KEY: "forbidden" }]) {
    const settings = { ...current.settings, ...injected };
    const invalid = await request("/api/admin/agent/validate", { method: "POST", body: { settings } });
    assert.equal(invalid.valid, false);
    const denied = await request("/api/admin/agent/config", { method: "PUT", body: { settings, expectedRevision: current.revision, reason: "拒绝额外字段" }, status: 400 });
    assert.equal(denied.error.code, "INVALID_AGENT_CONFIG");
  }
  assert.equal((await config()).revision, current.revision);
});

test("production writes reject null, cross origin, malformed origins and accept same origin", async () => {
  const current = await config();
  for (const origin of ["null", "https://evil.example", "https://synthetic.example.evil", "https://synthetic.example/path"]) {
    const denied = await save({}, { origin, status: 403 });
    assert.equal(denied.error.code, "INVALID_ORIGIN");
  }
  assert.equal((await config()).revision, current.revision);
  await save({ replyInstruction: "同源合成配置" }, { origin: "https://synthetic.example" });
});

test("save hot swaps both harnesses, preserves shared concurrency and history restores with a new revision", async () => {
  const initial = await config(), previous = instances.at(-1);
  const updated = await save({ model: "synthetic-model", timeoutMs: 12345, replyInstruction: "合成回复规则" });
  assert.ok(updated.revision > initial.revision);
  assert.equal(previous.retired, true);
  assert.equal(instances.at(-1).env.ANHAO_LLM_MODEL, "synthetic-model");
  assert.equal(instances.at(-1).env.ANHAO_LLM_TIMEOUT_MS, "12345");
  assert.equal(instances.at(-1).env.ANHAO_LLM_REPLY_INSTRUCTION, "合成回复规则");
  assert.equal(instances.at(-1).sharedConcurrency, previous.sharedConcurrency);
  const conflict = await request("/api/admin/agent/config", { method: "PUT", body: { expectedRevision: initial.revision, settings: initial.settings, reason: "过期版本" }, status: 409 });
  assert.equal(conflict.error.code, "CONFIG_CONFLICT");
  const { history } = await request("/api/admin/agent/history");
  assert.equal(history[0].revision, updated.revision);
  const restored = await request("/api/admin/agent/rollback", { method: "POST", body: { expectedRevision: updated.revision, revision: initial.revision, reason: "合成历史恢复" } });
  assert.ok(restored.revision > updated.revision);
  assert.deepEqual(restored.settings, initial.settings);
  assert.equal((await request("/api/admin/agent/history")).history[0].restoredFrom, initial.revision);
});

test("configuration changes discard pending drafts before persistence", async () => {
  const thread = await room();
  await enable(thread, "suggest");
  const before = calls.length;
  const pending = request(`${thread.agent}/suggest`, { token: thread.owner.token, method: "POST", body: { consent: true }, status: 409 });
  const call = await nextCall(thread, before);
  await save({ replyInstruction: "修改生成规则" });
  await finish(call, { draft: "过期草稿不得保存" });
  assert.equal((await pending).error.code, "AGENT_CANCELLED");
  assert.equal((await state(thread)).settings.draft, "");
});

test("non-disable changes cancel old auto results and reschedule only prior consent", async () => {
  await save({ enabled: true, allowAutoReply: true });
  const thread = await room();
  const untouched = await room();
  await enable(thread);
  const before = calls.length;
  await incoming(thread);
  const old = await nextCall(thread, before);
  const oldState = (await state(thread)).settings;
  await save({ autoInstruction: "新的合成代回规则" });
  assert.equal((await state(thread)).settings.enabled, true);
  assert.equal((await state(thread)).settings.consentAt, oldState.consentAt);
  assert.equal((await state(untouched)).settings.enabled, false);
  await finish(old, { draft: "过期代回不能入库" });
  const replacement = await nextCall(thread, before + 1);
  assert.notEqual(replacement.instance, old.instance);
  assert.equal((await request(thread.messages, { token: thread.peer.token })).messages.length, 1);
  await finish(replacement, { draft: "新配置下的有效回复" });
  await eventually(async () => (await request(thread.messages, { token: thread.peer.token })).messages, rows => rows.length === 2);
  await request(`${thread.agent}/disable`, { token: thread.owner.token, method: "POST" });
});

for (const patch of [{ allowAutoReply: false }, { enabled: false }]) {
  test(`${Object.keys(patch)[0]} false disables existing auto consent and drops late results`, async () => {
    await save({ enabled: true, allowAutoReply: true });
    const thread = await room();
    await enable(thread);
    const before = calls.length;
    await incoming(thread);
    const pending = await nextCall(thread, before);
    const oldState = (await state(thread)).settings;
    assert.equal((await request("/api/admin/agent/status")).activeJobs, 1);
    await save(patch);
    const disabled = (await state(thread)).settings;
    assert.equal(disabled.enabled, false);
    assert.ok(disabled.version > oldState.version);
    assert.equal(disabled.autoReason, "admin_disabled");
    await finish(pending, { draft: "禁用后不得入库" });
    assert.equal((await request(thread.messages, { token: thread.peer.token })).messages.length, 1);
    await save({ enabled: true, allowAutoReply: true });
    assert.equal((await state(thread)).settings.enabled, false);
    assert.equal(calls.length, before + 1);
  });
}

test("persisted configuration is reapplied after reopening the business database", async () => {
  const saved = await save({ enabled: false, model: "persisted-synthetic", replyInstruction: "持久化规则" });
  await stop();
  await start();
  const reopened = await config();
  assert.equal(reopened.revision, saved.revision);
  assert.deepEqual(reopened.settings, saved.settings);
  assert.equal(instances.at(-1).env.ANHAO_LLM_MODEL, "persisted-synthetic");
  assert.equal(instances.at(-1).env.ANHAO_LLM_REPLY_INSTRUCTION, "持久化规则");
});
