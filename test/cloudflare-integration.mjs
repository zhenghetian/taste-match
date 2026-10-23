// Manual workerd integration; deliberately excluded from *.test.mjs.
// Run against an already running, isolated synthetic Wrangler instance:
//   node test/cloudflare-integration.mjs run [absolute-session-file]
// After restarting Wrangler with the same persistence directory:
//   node test/cloudflare-integration.mjs verify absolute-session-file
// Optional session files belong under ~/Documents/06-AI/90-过程/<task>/.
// CLOUDFLARE_TEST_URL defaults to http://127.0.0.1:8787.
// CLOUDFLARE_TEST_ADMIN_KEY / CLOUDFLARE_TEST_BETA_CODE override synthetic defaults.
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

const base = new URL(process.env.CLOUDFLARE_TEST_URL || "http://127.0.0.1:8787");
const adminKey = process.env.CLOUDFLARE_TEST_ADMIN_KEY || "synthetic-cloud-admin";
const betaCode = process.env.CLOUDFLARE_TEST_BETA_CODE || "424242";
const [mode = "run", sessionFile = process.env.CLOUDFLARE_TEST_SESSION] = process.argv.slice(2);
const timeout = 10_000;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=", "base64");
const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
let stage = "preflight";

function report(name) { stage = name; console.log(`CHECK ${name}`); }
function endpoint(path) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, "API requests must stay on the local test origin");
  assert.ok(url.pathname.startsWith("/api/"), "only API requests are allowed");
  return url;
}
async function request(path, { method = "GET", token, admin = false, body, status = 200, binary = false } = {}) {
  const response = await fetch(endpoint(path), {
    method, redirect: "error", signal: AbortSignal.timeout(timeout),
    headers: { "content-type": "application/json", "origin": base.origin, ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(admin ? { "x-admin-key": adminKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  // Do not print response bodies: registration returns bearer sessions.
  assert.equal(response.status, status, `${method} ${new URL(path, base).pathname}: HTTP ${response.status}, expected ${status}`);
  if (binary) return { response, payload: bytes };
  assert.match(response.headers.get("content-type") || "", /application\/json/, `${path}: expected JSON`);
  let payload;
  try { payload = JSON.parse(bytes.toString()); } catch { throw new Error(`${path}: malformed JSON`); }
  if (path.startsWith("/api/admin/agent")) assert.equal(response.headers.get("cache-control"), "no-store");
  return { response, payload };
}
async function json(path, options) { return (await request(path, options)).payload; }
async function denied(path, status, options = {}, code) {
  const result = await json(path, { ...options, status });
  assert.equal(typeof result.error?.code, "string", `${path}: expected structured error`);
  if (code) assert.equal(result.error.code, code, path);
}
const messagesPath = peer => `/api/friends/${peer.id}/messages`;
const uploadPath = session => `/api/agent/threads/friend/${session.friendshipId}/attachments`;
const adminConfig = () => json("/api/admin/agent/config", { admin: true });

async function checkpoint(session) {
  if (!sessionFile) return;
  await mkdir(dirname(sessionFile), { recursive: true });
  await writeFile(sessionFile, JSON.stringify(session, null, 2) + "\n", { mode: 0o600 });
}
async function register(label, phone) {
  const sent = await json("/api/auth/send-code", { method: "POST", body: { phone } });
  assert.equal(sent.delivery, "beta", "synthetic fixture must use beta delivery, never SMS");
  const login = await json("/api/auth/verify", { method: "POST", body: { phone, code: betaCode } });
  assert.ok(login.token && login.user.id);
  assert.equal(login.user.profileCompleted, false, "use a new synthetic identity for every run");
  const profile = { nickname: `合成${label}`, city: "杭州", birthYear: 1998, gender: "不公开", bio: "本地集成验证合成资料" };
  const { user } = await json("/api/me", { token: login.token, method: "PATCH", body: profile });
  assert.equal(user.profileCompleted, true);
  return { id: user.id, token: login.token, profile };
}

async function openEvents(token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("SSE ready/message timeout")), timeout);
  let reader;
  try {
    const response = await fetch(endpoint(`/api/events?token=${encodeURIComponent(token)}`), {
      signal: controller.signal, redirect: "error"
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    async function nextEvent() {
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = frame.split("\n");
          const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          if (!data) continue; // heartbeat/comment
          return { type: lines.find(line => line.startsWith("event:"))?.slice(6).trim(), data: JSON.parse(data) };
        }
        const { done, value } = await reader.read();
        assert.equal(done, false, "SSE closed before the expected event");
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        assert.ok(buffer.length < 1_000_000, "SSE frame exceeded test limit");
      }
    }
    const ready = await nextEvent();
    assert.equal(ready.type, "ready");
    assert.equal(ready.data.ok, true);
    return {
      async message(expected) {
        while (true) {
          const event = await nextEvent();
          if (event.type === "friend_message" && event.data.id === expected.id) {
            assert.deepEqual(event.data, expected, "SSE and POST message shapes differ");
            return;
          }
        }
      },
      async close() { clearTimeout(timer); controller.abort(); await reader.cancel().catch(() => {}); }
    };
  } catch (error) {
    clearTimeout(timer); controller.abort();
    await reader?.cancel().catch(() => {});
    throw error;
  }
}
async function download(attachment, token, expected) {
  const { payload, response } = await request(attachment.url, { token, binary: true });
  assert.deepEqual(payload, expected, "downloaded bytes differ from uploaded bytes");
  assert.equal(response.headers.get("content-type"), attachment.mimeType);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}
function messageFields(message) {
  return Object.fromEntries(["id", "body", "kind", "senderId", "source", "attachment", "link"]
    .filter(key => message[key] !== undefined).map(key => [key, message[key]]));
}

async function verify(session) {
  assert.equal(session.schema, 1);
  assert.equal(session.base, base.origin, "session belongs to a different Wrangler origin");
  assert.equal(session.complete, true, "session did not finish setup; rerun integration first");
  report("profiles, sessions and friendship persistence");
  for (const person of [session.owner, session.peer, session.stranger]) {
    const { user } = await json("/api/me", { token: person.token });
    assert.equal(user.id, person.id);
    assert.equal(user.profileCompleted, true);
    for (const [key, value] of Object.entries(person.profile)) assert.equal(user[key], value, `profile.${key}`);
  }
  for (const [person, peer] of [[session.owner, session.peer], [session.peer, session.owner]]) {
    const { friends } = await json("/api/friends", { token: person.token });
    assert.ok(friends.some(row => row.id === session.friendshipId && row.friend.id === peer.id));
    const { messages } = await json(messagesPath(peer), { token: person.token });
    for (const expected of session.messages) {
      const actual = messages.find(row => row.id === expected.id);
      assert.ok(actual, `missing persisted ${expected.kind} message`);
      assert.deepEqual(messageFields(actual), expected);
    }
  }
  report("private image/sticker bytes and permissions");
  for (const [attachment, bytes] of [[session.image, png], [session.sticker, gif]]) {
    for (const person of [session.owner, session.peer]) await download(attachment, person.token, bytes);
    await download({ ...attachment, url: `${attachment.url}?token=${encodeURIComponent(session.peer.token)}` }, undefined, bytes);
    await denied(attachment.url, 401, {}, "AUTH_REQUIRED");
    await denied(attachment.url, 404, { token: session.stranger.token }, "ATTACHMENT_NOT_FOUND");
  }
  report("admin restored revision persistence");
  const current = await adminConfig();
  assert.equal(current.revision, session.admin.revision);
  assert.deepEqual(current.settings, session.admin.settings);
  const { history } = await json("/api/admin/agent/history", { admin: true });
  const restored = history.find(row => row.revision === current.revision);
  assert.equal(restored?.restoredFrom, session.admin.restoredFrom);
  assert.equal((await json("/api/admin/agent/status", { admin: true })).revision, current.revision);
}

async function run() {
  report("synthetic beta fixture and admin authentication");
  const providers = await json("/api/auth/providers");
  assert.equal(providers.betaTestMode, true, "Wrangler must be configured with a synthetic beta code");
  await denied("/api/me", 401, {}, "AUTH_REQUIRED");
  await denied("/api/events", 401, {}, "AUTH_REQUIRED");
  await denied("/api/admin/agent/config", 401, {}, "ADMIN_AUTH_REQUIRED");
  const initial = await adminConfig();
  assert.equal(initial.settings.enabled, false, "use the isolated local fixture with AI disabled");
  const session = { schema: 1, base: base.origin, runId: randomUUID(), complete: false, messages: [] };
  // Reserved-looking synthetic numbers, never imported from an existing account.
  const suffix = randomInt(0, 1_000_000);
  report("register and complete three synthetic profiles");
  for (const [index, key, label] of [[0, "owner", "甲方"], [1, "peer", "乙方"], [2, "stranger", "旁观"]]) {
    session[key] = await register(label, `199${String(suffix).padStart(6, "0")}${String(index).padStart(2, "0")}`);
  }
  await checkpoint(session);
  const { owner, peer, stranger } = session;
  report("friend invite and two-way text messages");
  const { invite } = await json("/api/friends/invite", { token: owner.token });
  assert.match(invite.code, /^FH[A-F0-9]{8}$/);
  await denied("/api/friends/join", 400, { token: owner.token, method: "POST", body: { code: invite.code } }, "CANNOT_FRIEND_SELF");
  const joined = await json("/api/friends/join", { token: peer.token, method: "POST", body: { code: invite.code }, status: 201 });
  assert.equal(joined.alreadyFriends, false);
  assert.equal(joined.friendship.friend.id, owner.id);
  session.friendshipId = joined.friendship.id;
  const again = await json("/api/friends/join", { token: peer.token, method: "POST", body: { code: invite.code } });
  assert.equal(again.alreadyFriends, true);
  await denied(messagesPath(owner), 404, { token: stranger.token }, "FRIENDSHIP_NOT_FOUND");
  async function send(person, recipient, body) {
    const { message } = await json(messagesPath(recipient), { token: person.token, method: "POST", body, status: 201 });
    assert.equal(message.senderId, person.id);
    assert.equal(message.source, "user");
    session.messages.push(messageFields(message));
    return message;
  }
  const text = await send(owner, peer, { body: `合成问候 ${session.runId}` });
  assert.equal(text.kind, "text");
  const reply = await send(peer, owner, { body: "合成双向回复" });
  assert.equal(reply.body, "合成双向回复");
  const link = await send(owner, peer, { kind: "link", link: { url: "https://example.com/synthetic?q=1", title: "合成链接" } });
  assert.equal(link.kind, "link");
  assert.equal(link.link.url, "https://example.com/synthetic?q=1");
  await denied(messagesPath(peer), 400, { token: owner.token, method: "POST", body: { kind: "link", link: { url: "javascript:alert(1)" } } });

  report("R2 image upload, unsent ownership and SSE delivery");
  const input = { data: png.toString("base64"), mimeType: "image/png", name: "../../合成.png" };
  await denied(uploadPath(session), 401, { method: "POST", body: input }, "AUTH_REQUIRED");
  await denied(uploadPath(session), 404, { token: stranger.token, method: "POST", body: input });
  await denied(uploadPath(session), 400, { token: owner.token, method: "POST", body: { ...input, mimeType: "image/jpeg" } });
  session.image = (await json(uploadPath(session), { token: owner.token, method: "POST", body: input, status: 201 })).attachment;
  assert.equal(session.image.size, png.length);
  assert.equal(session.image.name.includes("/"), false);
  await download(session.image, owner.token, png);
  await denied(session.image.url, 404, { token: peer.token }, "ATTACHMENT_NOT_FOUND");
  await denied(session.image.url, 404, { token: stranger.token }, "ATTACHMENT_NOT_FOUND");
  await denied(messagesPath(owner), 400, { token: peer.token, method: "POST", body: { kind: "image", attachmentId: session.image.id } });
  await checkpoint(session);
  const events = await openEvents(peer.token);
  try {
    const image = await send(owner, peer, { kind: "image", attachmentId: session.image.id, source: "agent_auto" });
    assert.equal(image.kind, "image");
    assert.deepEqual(image.attachment, session.image);
    await events.message(image);
  } finally { await events.close(); }
  await denied(messagesPath(peer), 400, { token: owner.token, method: "POST", body: { kind: "image", attachmentId: session.image.id } });
  report("GIF sticker upload and peer delivery");
  session.sticker = (await json(uploadPath(session), { token: peer.token, method: "POST", status: 201,
    body: { data: gif.toString("base64"), mimeType: "image/gif", name: "合成表情.gif" } })).attachment;
  await denied(session.sticker.url, 404, { token: owner.token }, "ATTACHMENT_NOT_FOUND");
  const sticker = await send(peer, owner, { kind: "sticker", attachmentId: session.sticker.id });
  assert.equal(sticker.kind, "sticker");
  assert.deepEqual(sticker.attachment, session.sticker);
  await checkpoint(session);

  report("admin validation, version conflict and history restore");
  const settings = { ...initial.settings, replyInstruction: `合成集成规则 ${session.runId}` };
  const validation = await json("/api/admin/agent/validate", { admin: true, method: "POST", body: { settings } });
  assert.equal(validation.valid, true);
  let updated;
  try {
    updated = await json("/api/admin/agent/config", { admin: true, method: "PUT",
      body: { expectedRevision: initial.revision, settings, reason: "合成集成测试" } });
    assert.ok(updated.revision > initial.revision);
    assert.deepEqual(updated.settings, settings);
    await denied("/api/admin/agent/config", 409, { admin: true, method: "PUT",
      body: { expectedRevision: initial.revision, settings, reason: "合成过期版本" } }, "CONFIG_CONFLICT");
    assert.equal((await adminConfig()).revision, updated.revision);
    const { history } = await json("/api/admin/agent/history", { admin: true });
    assert.ok(history.some(row => row.revision === updated.revision));
  } finally {
    if (updated) {
      // An optimistic rollback restores the initial fixture even if a check failed.
      const restored = await json("/api/admin/agent/rollback", { admin: true, method: "POST",
        body: { expectedRevision: updated.revision, revision: initial.revision, reason: "恢复合成测试前配置" } });
      assert.ok(restored.revision > updated.revision);
      assert.deepEqual(restored.settings, initial.settings);
      session.admin = { revision: restored.revision, settings: restored.settings, restoredFrom: initial.revision };
    }
  }
  session.complete = true;
  await checkpoint(session);
  await verify(session);
  if (sessionFile) console.log(`Synthetic session saved: ${sessionFile}`);
}

try {
  assert.ok(["run", "verify"].includes(mode), "usage: node test/cloudflare-integration.mjs [run|verify] [absolute-session-file]");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) && base.protocol === "http:", "only local HTTP Wrangler URLs are supported");
  assert.equal(base.username + base.password + base.search + base.hash, "", "test URL must not contain credentials/query/hash");
  assert.equal(base.pathname, "/", "test URL must be an origin");
  if (sessionFile) assert.ok(isAbsolute(sessionFile), "session path must be absolute; use the task's process directory");
  if (mode === "verify") assert.ok(sessionFile, "verify requires the synthetic session file from a successful run");
  try { assert.equal((await json("/api/health")).ok, true); }
  catch { throw new Error(`Local Wrangler is unavailable or unhealthy at ${base.origin}; ask the main agent to start it. This script never starts Wrangler.`); }
  if (mode === "run") await run();
  else await verify(JSON.parse(await readFile(sessionFile, "utf8")));
  console.log(`PASS cloudflare integration (${mode})`);
} catch (error) {
  // Assertion operands may include synthetic tokens; print only the short message.
  console.error(`FAIL [${stage}] ${error.message}`);
  process.exitCode = 1;
}
