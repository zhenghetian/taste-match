import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4196;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "anhao-agent-"));
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

test("agent suggest-then-confirm persists draft and labels sent message", async () => {
  const user = await register("13610000001", "小河");
  const contentId = "7653500525270670770";
  const signal = await request("/api/signals", {
    token: user.token,
    method: "POST",
    body: { contentId, reaction: "下班后多走一站，才觉得这一天有一点是自己的。" }
  });
  assert.ok(signal.echo?.id);
  const echoId = signal.echo.id;

  // Answer so chat unlocks (demo partner already answered)
  await request(`/api/echoes/${echoId}/answer`, {
    token: user.token,
    method: "POST",
    body: { answer: "我会留出一段没有目标的时间，慢慢走走" }
  });

  await expectFailure(`/api/agent/threads/echo/${echoId}/suggest`, 400, "AI_CONSENT_REQUIRED", {
    token: user.token,
    body: {}
  });

  const enabled = await request(`/api/agent/threads/echo/${echoId}/enable`, {
    token: user.token,
    method: "POST",
    body: { consent: true }
  });
  assert.equal(enabled.settings.enabled, true);

  const suggested = await request(`/api/agent/threads/echo/${echoId}/suggest`, {
    token: user.token,
    method: "POST",
    body: { consent: true }
  });
  assert.equal(suggested.autoSend, false);
  assert.equal(suggested.source, "fallback");
  assert.ok(suggested.draft.length > 0);

  const loaded = await request(`/api/agent/threads/echo/${echoId}`, { token: user.token });
  assert.equal(loaded.settings.draft, suggested.draft);

  const sent = await request(`/api/echoes/${echoId}/messages`, {
    token: user.token,
    method: "POST",
    body: { body: suggested.draft, source: "agent_suggestion" }
  });
  assert.equal(sent.message.source, "agent_suggestion");

  const thread = await request(`/api/echoes/${echoId}/messages`, { token: user.token });
  const labeled = thread.messages.find((item) => item.id === sent.message.id);
  assert.equal(labeled.source, "agent_suggestion");

  const afterSend = await request(`/api/agent/threads/echo/${echoId}`, { token: user.token });
  assert.equal(afterSend.settings.draft, "");

  await request(`/api/agent/threads/echo/${echoId}/disable`, { token: user.token, method: "POST" });
  const disabled = await request(`/api/agent/threads/echo/${echoId}`, { token: user.token });
  assert.equal(disabled.settings.enabled, false);
});

test("friend threads also support agent drafts", async () => {
  const owner = await register("13610000002", "邀请人");
  const guest = await register("13610000003", "朋友");
  const invite = (await request("/api/friends/invite", { token: owner.token })).invite;
  const joined = await request("/api/friends/join", { token: guest.token, method: "POST", body: { code: invite.code } });
  const friendshipId = joined.friendship.id;

  await request(`/api/friends/${owner.user.id}/messages`, {
    token: guest.token,
    method: "POST",
    body: { body: "你好，我通过邀请加入了。" }
  });

  const suggested = await request(`/api/agent/threads/friend/${friendshipId}/suggest`, {
    token: owner.token,
    method: "POST",
    body: { consent: true }
  });
  assert.equal(suggested.autoSend, false);
  assert.ok(suggested.draft);

  const sent = await request(`/api/friends/${guest.user.id}/messages`, {
    token: owner.token,
    method: "POST",
    body: { body: suggested.draft, source: "agent_suggestion" }
  });
  assert.equal(sent.message.source, "agent_suggestion");
});
