import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4195;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "anhao-tone-"));
let server;

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("agent test server did not start");
}

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${method} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function expectFailure(path, status, code, { token, method = "POST", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.status, status, path);
  assert.equal((await response.json()).error.code, code, path);
}

async function register(phone, nickname) {
  await request("/api/auth/send-code", { method: "POST", body: { phone } });
  const login = await request("/api/auth/verify", { method: "POST", body: { phone, code: "123456" } });
  await request("/api/me", { token: login.token, method: "PATCH", body: { nickname, city: "上海", birthYear: 1998, gender: "不公开", bio: "愿意慢慢聊" } });
  return login;
}

test.before(async () => {
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      NODE_ENV: "production",
      BETA_TEST_CODE: "123456",
      DEMO_MATCHING_ENABLED: "true",
      ANHAO_LLM_ENABLED: "false",
      ADMIN_KEY: "test-admin"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer();
});

test.after(() => {
  server?.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
});
async function openEcho(phone, nickname, contentId) {
  const user = await register(phone, nickname);
  const signal = await request("/api/signals", { token: user.token, method: "POST", body: { contentId, reaction: "下班后多走一站，才觉得这一天有一点是自己的。" } });
  await request(`/api/echoes/${signal.echo.id}/answer`, { token: user.token, method: "POST", body: { answer: "我会留出一段没有目标的时间" } });
  return { user, echoId: signal.echo.id };
}

test("agent learns tone from confirmed and edited suggestions; list/delete/clear", async () => {
  const { user, echoId } = await openEcho("13620000001", "语气", "7653500525270670770");
  const base = `/api/agent/threads/echo/${echoId}`;
  await request(`${base}/enable`, { token: user.token, method: "POST", body: { consent: true } });
  const first = await request(`${base}/suggest`, { token: user.token, method: "POST", body: {} });
  await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: first.draft, source: "agent_suggestion" } });
  await request(`${base}/suggest`, { token: user.token, method: "POST", body: {} });
  await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: "哈哈我改短了", source: "agent_suggestion" } });
  // plain user message without suggestion is never learned
  await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: "普通消息", source: "agent_suggestion" } });
  let { examples } = await request(`${base}/tone-examples`, { token: user.token });
  assert.equal(examples.length, 2);
  assert.equal(examples[0].finalText, "哈哈我改短了");
  assert.equal(examples[0].edited, true);
  assert.equal(examples[1].edited, false);
  assert.equal(examples[1].finalText, first.draft);
  await request(`/api/agent/tone-examples/${examples[0].id}`, { token: user.token, method: "DELETE" });
  await expectFailure(`/api/agent/tone-examples/${examples[0].id}`, 404, "TONE_EXAMPLE_NOT_FOUND", { token: user.token, method: "DELETE" });
  ({ examples } = await request(`${base}/tone-examples`, { token: user.token }));
  assert.equal(examples.length, 1);
  const cleared = await request(`${base}/tone-examples`, { token: user.token, method: "DELETE" });
  assert.equal(cleared.deleted, 1);
  ({ examples } = await request(`${base}/tone-examples`, { token: user.token }));
  assert.equal(examples.length, 0);
});

test("tone examples are capped at 50 per thread", async () => {
  const { user, echoId } = await openEcho("13620000002", "上限", "7656275297339198138");
  const base = `/api/agent/threads/echo/${echoId}`;
  await request(`${base}/enable`, { token: user.token, method: "POST", body: { consent: true } });
  for (let i = 0; i < 52; i += 1) {
    await request(`${base}/suggest`, { token: user.token, method: "POST", body: {} });
    await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: `第${i}条`, source: "agent_suggestion" } });
  }
  const { examples, cap } = await request(`${base}/tone-examples`, { token: user.token });
  assert.equal(cap, 50);
  assert.equal(examples.length, 50);
  assert.equal(examples[0].finalText, "第51条");
});

test("per-thread toggle blocks suggestions and never stores tone data", async () => {
  const { user, echoId } = await openEcho("13620000003", "关闭", "7482985809893707027");
  const base = `/api/agent/threads/echo/${echoId}`;
  await request(`${base}/enable`, { token: user.token, method: "POST", body: { consent: true } });
  await request(`${base}/suggest`, { token: user.token, method: "POST", body: {} });
  await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: "学到一条", source: "agent_suggestion" } });
  assert.equal((await request(`${base}/tone-examples`, { token: user.token })).examples.length, 1);
  await request(`${base}/suggest`, { token: user.token, method: "POST", body: {} });
  const off = await request(`${base}/suggestions`, { token: user.token, method: "POST", body: { allowed: false } });
  assert.equal(off.settings.suggestionsAllowed, false);
  assert.equal(off.settings.enabled, false);
  assert.equal(off.deletedToneExamples, 1);
  await expectFailure(`${base}/suggest`, 403, "AGENT_SUGGESTIONS_OFF", { token: user.token, body: { consent: true } });
  await expectFailure(`${base}/enable`, 403, "AGENT_SUGGESTIONS_OFF", { token: user.token, body: { consent: true } });
  await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: "不应学习", source: "agent_suggestion" } });
  assert.equal((await request(`${base}/tone-examples`, { token: user.token })).examples.length, 0);
  // agent merely disabled (but allowed) also stores nothing
  const on = await request(`${base}/suggestions`, { token: user.token, method: "POST", body: { allowed: true } });
  assert.equal(on.settings.suggestionsAllowed, true);
  await request(`${base}/enable`, { token: user.token, method: "POST", body: { consent: true } });
  await request(`${base}/suggest`, { token: user.token, method: "POST", body: {} });
  await request(`${base}/disable`, { token: user.token, method: "POST", body: {} });
  await request(`/api/echoes/${echoId}/messages`, { token: user.token, method: "POST", body: { body: "也不应学习", source: "agent_suggestion" } });
  assert.equal((await request(`${base}/tone-examples`, { token: user.token })).examples.length, 0);
});

test("tone examples stay within their own thread", async () => {
  const a = await openEcho("13620000004", "跨会话", "7661621584175566126");
  const user = a.user;
  const signal = await request("/api/signals", { token: user.token, method: "POST", body: { contentId: "7535852633412603136", reaction: "想慢一点" } });
  await request(`/api/echoes/${signal.echo.id}/answer`, { token: user.token, method: "POST", body: { answer: "慢慢来" } });
  const baseA = `/api/agent/threads/echo/${a.echoId}`;
  const baseB = `/api/agent/threads/echo/${signal.echo.id}`;
  await request(`${baseA}/enable`, { token: user.token, method: "POST", body: { consent: true } });
  await request(`${baseA}/suggest`, { token: user.token, method: "POST", body: {} });
  await request(`/api/echoes/${a.echoId}/messages`, { token: user.token, method: "POST", body: { body: "只属于A", source: "agent_suggestion" } });
  assert.equal((await request(`${baseA}/tone-examples`, { token: user.token })).examples.length, 1);
  assert.equal((await request(`${baseB}/tone-examples`, { token: user.token })).examples.length, 0);
  assert.equal((await request(`${baseB}/tone-examples`, { token: user.token, method: "DELETE" })).deleted, 0);
  assert.equal((await request(`${baseA}/tone-examples`, { token: user.token })).examples.length, 1);
});
