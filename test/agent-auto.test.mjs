import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";

// Set these before importing server.mjs: its database and harnesses are module scoped.
const dataDir = mkdtempSync(join(tmpdir(), "anhao-agent-auto-"));
Object.assign(process.env, {
  DATA_DIR: dataDir,
  ANHAO_LLM_ENABLED: "true",
  ANHAO_LLM_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "synthetic-auto-key",
  ANHAO_LLM_MODEL: "deepseek-flash",
  ANHAO_LLM_AUTO_REPLY_ENABLED: "true",
  MODERATION_WEBHOOK_URL: "",
  NODE_ENV: "production",
  BETA_TEST_CODE: "123456",
  DEMO_MATCHING_ENABLED: "true",
  SMS_WEBHOOK_URL: ""
});

let server;
let base;
let serial = 0;
const calls = [];
const replyHarness = {
  suggest(input) {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const call = {
      input,
      settled: false,
      finish(result = {}) {
        assert.equal(call.settled, false, "a harness result must only be delivered once");
        call.settled = true;
        resolve({ source: "model", draft: "合成模型回复", runId: `synthetic-${calls.length}`, ...result });
      }
    };
    calls.push(call);
    return promise;
  },
  close() {}
};

async function startServer(fresh = false) {
  // A new module instance opens a new SQLite connection for the persistence checks.
  const url = new URL("../server.mjs", import.meta.url);
  if (fresh) url.searchParams.set("agent-auto-reload", String(++serial));
  const { createServer } = await import(url.href);
  server = createServer({ replyHarness });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
}

async function stopServer() {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function request(path, { token, method = "GET", body, status = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(3000)
  });
  const payload = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function eventually(read, accept, message) {
  const deadline = Date.now() + 3000;
  let value;
  do {
    value = await read();
    if (accept(value)) return value;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
}

async function register() {
  const phone = `13588${String(++serial).padStart(6, "0")}`;
  const sent = await request("/api/auth/send-code", { method: "POST", body: { phone } });
  assert.equal(sent.delivery, "beta");
  assert.equal(sent.devCode, undefined);
  // Deliberately no invite field: registration must not depend on AH/FH codes.
  return request("/api/auth/verify", { method: "POST", body: { phone, code: "123456" } });
}

async function friendThread() {
  const owner = await register();
  const peer = await register();
  const { invite } = await request("/api/friends/invite", { token: owner.token });
  const { friendship } = await request("/api/friends/join", {
    token: peer.token, method: "POST", body: { code: invite.code }, status: 201
  });
  return thread("friend", friendship.id, owner, peer);
}

function thread(kind, id, owner, peer) {
  return {
    kind, id, owner, peer,
    agent: `/api/agent/threads/${kind}/${id}`,
    messagesFor(actor) {
      return kind === "echo" ? `/api/echoes/${id}/messages`
        : `/api/friends/${actor.user.id === owner.user.id ? peer.user.id : owner.user.id}/messages`;
    }
  };
}

async function settings(room, actor = room.owner) {
  return (await request(room.agent, { token: actor.token })).settings;
}

async function enable(room, actor = room.owner) {
  const result = await request(`${room.agent}/enable`, {
    token: actor.token, method: "POST", body: { consent: true, mode: "auto" }
  });
  assert.equal(result.settings.enabled, true);
  assert.equal(result.settings.mode, "auto");
  assert.ok(result.settings.consentAt);
  assert.equal(result.settings.autoReason, null);
  return result.settings;
}

async function disable(room, actor = room.owner) {
  return (await request(`${room.agent}/disable`, { token: actor.token, method: "POST" })).settings;
}

async function send(room, actor, body, extra = {}) {
  return (await request(room.messagesFor(actor), {
    token: actor.token, method: "POST", body: { body, ...extra }, status: 201
  })).message;
}

async function messages(room, actor = room.owner) {
  return (await request(room.messagesFor(actor), { token: actor.token })).messages;
}

async function nextCall(room, after = 0, actor = room.owner) {
  return eventually(
    () => calls.slice(after).find((call) => call.input.threadKey === `${room.kind}:${room.id}` && call.input.actorId === actor.user.id),
    Boolean,
    "expected an injected automatic generation"
  );
}

async function settle(call, result) {
  call.finish(result);
  // Drain the job's promise continuations, including moderation and finally/requeue.
  await nextTurn();
  await nextTurn();
}

function persistedMessages(room) {
  const db = new DatabaseSync(join(dataDir, "anhao.db"), { readOnly: true });
  try {
    return room.kind === "echo"
      ? db.prepare("SELECT body, source FROM messages WHERE echo_id=? ORDER BY rowid").all(room.id)
      : db.prepare("SELECT body, source FROM friend_messages WHERE friendship_id=? ORDER BY rowid").all(room.id);
  } finally {
    db.close();
  }
}

async function assertIdle(room, enabled) {
  const state = await eventually(() => settings(room), (value) => value.autoStatus === "idle", "automatic job did not finish");
  assert.equal(state.enabled, enabled);
  assert.equal(state.mode, "auto");
  assert.equal(state.autoReason, null);
}

test.before(() => startServer());
test.afterEach(async () => {
  // A failed assertion must not leave a deferred job holding the suite open.
  for (const call of calls.filter((item) => !item.settled)) {
    call.finish({ source: "fallback", reason: "disabled", draft: "不得发送的清理话术" });
  }
  await nextTurn();
  await nextTurn();
});
test.after(async () => {
  await stopServer();
  await nextTurn();
  rmSync(dataDir, { recursive: true, force: true });
});

test("registration needs no invite but still rejects an incorrect OTP", async () => {
  const phone = "13588000000";
  await request("/api/auth/send-code", { method: "POST", body: { phone } });
  const invalid = await request("/api/auth/verify", {
    method: "POST", body: { phone, code: "000000" }, status: 400
  });
  assert.equal(invalid.error.code, "INVALID_CODE");
  const login = await request("/api/auth/verify", { method: "POST", body: { phone, code: "123456" } });
  assert.ok(login.token);
  assert.ok(login.user.id);
  const replay = await request("/api/auth/verify", {
    method: "POST", body: { phone, code: "123456" }, status: 400
  });
  assert.equal(replay.error.code, "INVALID_CODE");
});

test("friend auto mode requires consent and sends a labeled reply only for the other person's message", async () => {
  const room = await friendThread();
  const before = calls.length;
  const initial = await settings(room);
  assert.equal(initial.enabled, false);
  assert.equal(initial.mode, "suggest");
  assert.equal(initial.autoStatus, "idle");
  assert.equal(initial.autoReason, null);
  for (const consent of [undefined, false, "true"]) {
    const denied = await request(`${room.agent}/enable`, {
      token: room.owner.token, method: "POST", body: { mode: "auto", consent }, status: 400
    });
    assert.equal(denied.error.code, "AI_CONSENT_REQUIRED");
  }
  const outsider = await register();
  const denied = await request(`${room.agent}/enable`, {
    token: outsider.token, method: "POST", body: { mode: "auto", consent: true }, status: 404
  });
  assert.equal(denied.error.code, "FRIENDSHIP_NOT_FOUND");
  await enable(room);
  assert.equal(calls.length, before, "empty threads must not generate spontaneously");
  const conflict = await request(`${room.agent}/suggest`, {
    token: room.owner.token, method: "POST", body: { consent: true }, status: 409
  });
  assert.equal(conflict.error.code, "AUTO_REPLY_ACTIVE");
  // The sender's own automatic mode is taken over by this human send.
  await enable(room, room.peer);
  const incoming = await send(room, room.peer, "你周末喜欢沿着河边散步吗？", { source: "agent_auto" });
  assert.equal(incoming.source, "user", "HTTP clients cannot forge the automatic source label");
  const call = await nextCall(room, before);
  assert.equal(call.input.autoSend, true);
  assert.deepEqual(call.input.context.recentMessages.at(-1), { role: "other", text: incoming.body });
  assert.equal((await settings(room)).autoStatus, "generating");
  // Both ends enabled when the result arrives: an auto reply must not start another job.
  await enable(room, room.peer);
  await settle(call, { draft: "我喜欢慢慢走，也会留意河边的树。" });
  const rows = await messages(room);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].senderId, room.owner.user.id);
  assert.equal(rows[1].source, "agent_auto");
  assert.equal(rows[1].body, "我喜欢慢慢走，也会留意河边的树。");
  assert.deepEqual(await messages(room, room.peer), rows);
  await assertIdle(room, true);
  assert.equal(calls.length, before + 1, "automatic replies must not ping-pong");
  assert.equal((await settings(room, room.peer)).enabled, true);
});

test("disable while generation is pending discards the late result and stops later triggers", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "先问候一下。");
  const call = await nextCall(room, before);
  const state = await disable(room);
  assert.equal(state.enabled, false);
  assert.equal(state.mode, "auto");
  assert.equal(state.autoStatus, "idle");
  await settle(call, { draft: "过期回复不得发送" });
  await send(room, room.peer, "已经接管后再发一条。");
  assert.deepEqual((await messages(room)).map((item) => item.source), ["user", "user"]);
  await assertIdle(room, false);
  assert.equal(calls.length, before + 1);
});

test("disable then re-enable invalidates the old generation even for the same incoming message", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "这条消息只需要回复一次。");
  const stale = await nextCall(room, before);
  await disable(room);
  await enable(room);
  await settle(stale, { draft: "上一次开启的旧结果" });
  const current = await nextCall(room, before + 1);
  assert.notEqual(current, stale);
  assert.equal((await messages(room)).length, 1, "re-enabling cannot make the old result valid again");
  await settle(current, { draft: "重新开启后的有效回复" });
  assert.deepEqual((await messages(room)).map((item) => item.body), ["这条消息只需要回复一次。", "重新开启后的有效回复"]);
  await assertIdle(room, true);
  assert.equal(calls.length, before + 2);
});

test("a manual send takes over a pending automatic reply", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "有空聊一下吗？");
  const pending = await nextCall(room, before);
  const human = await send(room, room.owner, "我来亲自回复，你好。");
  assert.equal(human.source, "user");
  await assertIdle(room, false);
  await settle(pending, { draft: "接管后不应出现的模型回复" });
  await send(room, room.peer, "好的，继续聊。");
  assert.deepEqual((await messages(room)).map((item) => item.body), ["有空聊一下吗？", human.body, "好的，继续聊。"]);
  assert.equal(calls.length, before + 1);
});

test("several new messages supersede a pending generation and only the latest receives an auto reply", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "最早的问题。");
  const stale = await nextCall(room, before);
  await send(room, room.peer, "补充一个中间问题。");
  await send(room, room.peer, "最后的问题：你喜欢安静的周末吗？");
  assert.equal(calls.length, before + 1, "a thread must have at most one active generation");
  await settle(stale, { draft: "不再适用的旧答案" });
  const latest = await nextCall(room, before + 1);
  assert.deepEqual(latest.input.context.recentMessages.at(-1), { role: "other", text: "最后的问题：你喜欢安静的周末吗？" });
  assert.equal((await messages(room)).length, 3);
  await settle(latest, { draft: "是的，我喜欢留一点安静的时间。" });
  const rows = await messages(room);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.filter((item) => item.source === "agent_auto").map((item) => item.body), ["是的，我喜欢留一点安静的时间。"]);
  await assertIdle(room, true);
  assert.equal(calls.length, before + 2);
});

for (const action of ["block", "unfriend"]) {
  test(`${action} during a pending friend generation prevents any late automatic message`, async () => {
    const room = await friendThread();
    await enable(room);
    const before = calls.length;
    await send(room, room.peer, "关系变动前的消息。");
    const pending = await nextCall(room, before);
    await request(action === "block" ? `/api/users/${room.peer.user.id}/block` : `/api/friends/${room.peer.user.id}`, {
      token: room.owner.token, method: action === "block" ? "POST" : "DELETE", status: action === "block" ? 201 : 200
    });
    await settle(pending, { draft: "关系失效后绝不能发送" });
    const expectedStatus = action === "block" ? 403 : 404;
    const denied = await request(room.messagesFor(room.peer), { token: room.peer.token, status: expectedStatus });
    assert.equal(denied.error.code, action === "block" ? "USER_BLOCKED" : "FRIENDSHIP_NOT_FOUND");
    // The HTTP history is now inaccessible; independently inspect only the temporary DB.
    assert.deepEqual(persistedMessages(room), []);
    assert.equal(calls.length, before + 1);
  });
}

test("fallback disables auto mode with a persisted failure reason and never sends canned text", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "模型不可用时请留给本人回复。");
  const call = await nextCall(room, before);
  await settle(call, { source: "fallback", draft: "绝不自动发送的备用话术", reason: "timeout" });
  const failed = await settings(room);
  assert.equal(failed.enabled, false);
  assert.equal(failed.mode, "auto");
  assert.equal(failed.autoStatus, "failed");
  assert.equal(failed.autoReason, "timeout");
  assert.equal((await messages(room)).length, 1);
  await stopServer();
  await startServer(true);
  assert.deepEqual(await settings(room), failed, "failure state must survive a fresh database connection");
  await send(room, room.peer, "失败后也不应自动重试。");
  assert.equal(calls.length, before + 1);
  assert.equal((await messages(room)).length, 2);
});

test("enabled settings and labeled messages survive reopening without duplicate sends", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "重开服务之前的消息。");
  await settle(await nextCall(room, before), { draft: "这条自动回复需要持久保存。" });
  const savedSettings = await settings(room);
  const savedMessages = await messages(room);
  assert.equal(savedMessages.at(-1).source, "agent_auto");
  await stopServer();
  await startServer(true);
  assert.deepEqual(await settings(room), savedSettings);
  assert.deepEqual(await messages(room), savedMessages);
  assert.equal(calls.length, before + 1, "reopening must not answer an already handled message again");
  await send(room, room.peer, "重开后的新消息。");
  await settle(await nextCall(room, before + 1), { draft: "重开后仍能自动回复。" });
  assert.equal((await messages(room)).filter((item) => item.source === "agent_auto").length, 2);
  await assertIdle(room, true);
});

test("reopening resumes an unanswered human message and discards the previous server's pending result", async () => {
  const room = await friendThread();
  await enable(room);
  const before = calls.length;
  await send(room, room.peer, "关闭服务时还没有收到回复的问题。");
  const oldCall = await nextCall(room, before);
  assert.equal((await settings(room)).autoStatus, "generating");
  await stopServer();
  await settle(oldCall, { draft: "关闭的服务不得提交这条结果" });
  assert.deepEqual(persistedMessages(room).map((item) => item.body), ["关闭服务时还没有收到回复的问题。"]);
  await startServer(true);
  const resumed = await nextCall(room, before + 1);
  assert.deepEqual(resumed.input.context.recentMessages.at(-1), { role: "other", text: "关闭服务时还没有收到回复的问题。" });
  await settle(resumed, { draft: "服务恢复后接住这条消息。" });
  const rows = await messages(room);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].source, "agent_auto");
  assert.equal(rows[1].body, "服务恢复后接住这条消息。");
  await assertIdle(room, true);
  assert.equal(calls.length, before + 2);
});

test("revealed echo threads auto reply and blocking cancels an in-flight echo result", async () => {
  const owner = await register();
  const peer = await register();
  const sourceUrl = `https://example.com/agent-auto-echo-${++serial}`;
  const signalBody = { sourceUrl, title: "合成回声内容", reaction: "这让我想起安静散步的时刻。" };
  await request("/api/signals", { token: owner.token, method: "POST", body: signalBody, status: 201 });
  const { echo } = await request("/api/signals", { token: peer.token, method: "POST", body: signalBody, status: 201 });
  assert.ok(echo?.id, "synthetic users must match each other on their unique shared URL");
  const room = thread("echo", echo.id, owner, peer);
  const locked = await request(`${room.agent}/enable`, {
    token: owner.token, method: "POST", body: { consent: true, mode: "auto" }, status: 403
  });
  assert.equal(locked.error.code, "ECHO_LOCKED");
  for (const actor of [owner, peer]) {
    await request(`/api/echoes/${echo.id}/answer`, { token: actor.token, method: "POST", body: { answer: "我愿意留一些时间慢慢交流。" } });
  }
  await enable(room);
  const before = calls.length;
  await send(room, peer, "这条内容的哪句话打动了你？");
  const call = await nextCall(room, before);
  assert.equal(call.input.autoSend, true);
  assert.equal(call.input.context.title, signalBody.title);
  await settle(call, { draft: "留出自己的时间这句话，让我想起散步。" });
  const rows = await messages(room, peer);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].source, "agent_auto");
  assert.equal(rows[1].senderId, owner.user.id);
  await send(room, peer, "再问一个问题。");
  const pending = await nextCall(room, before + 1);
  await request(`/api/users/${peer.user.id}/block`, { token: owner.token, method: "POST", status: 201 });
  await settle(pending, { draft: "拉黑后不能发送的回声回复" });
  assert.deepEqual(persistedMessages(room).map((item) => item.body), [...rows.map((item) => item.body), "再问一个问题。"]);
  const denied = await request(room.messagesFor(peer), { token: peer.token, status: 403 });
  assert.equal(denied.error.code, "USER_BLOCKED");
  assert.equal(calls.length, before + 2);
});
