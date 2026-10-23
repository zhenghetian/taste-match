import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApplication } from "../server-core.mjs";
import { createCloudMediaStore } from "../cloudflare/media.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(t, { env = {}, media = {}, mediaFactory, suggest, beforeAutoReply } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  let transactions = 0;
  db.transaction = callback => {
    transactions += 1;
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = callback();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const background = [];
  const factories = [];
  const harness = { status: () => ({ enabled: true }), close() {}, suggest: suggest || (async () => ({ source: "model", draft: "合成回复" })) };
  const app = createApplication({
    db,
    env: { NODE_ENV: "production", BETA_TEST_CODE: "123456", ADMIN_KEY: "test-admin", ...env },
    createMediaStore: mediaFactory || (() => ({ cleanup() {}, serialize: row => row, forMessage() {}, associate() {}, ...media })),
    harnessFactory: options => {
      factories.push(options);
      return { icebreakerHarness: harness, replyDraftHarness: harness };
    },
    usageReader: async () => 17,
    beforeAutoReply,
    background: promise => background.push(promise)
  });
  t.after(async () => {
    app.close();
    await Promise.all(background);
    db.close();
  });
  let serial = 0;
  async function register() {
    const phone = `13588${String(++serial).padStart(6, "0")}`;
    assert.equal((await request(app, "/api/auth/send-code", { phone })).status, 200);
    return (await request(app, "/api/auth/verify", { phone, code: "123456" })).body;
  }
  async function room() {
    const owner = await register();
    const peer = await register();
    const { invite } = (await request(app, "/api/friends/invite", undefined, owner.token)).body;
    const { friendship } = (await request(app, "/api/friends/join", { code: invite.code }, peer.token)).body;
    return { owner, peer, id: friendship.id, agent: `/api/agent/threads/friend/${friendship.id}` };
  }
  return { app, db, background, factories, register, room, transactionCount: () => transactions };
}

async function request(app, path, body, token, extraHeaders = {}) {
  const bytes = body === undefined ? undefined : new TextEncoder().encode(JSON.stringify(body));
  const req = {
    method: body === undefined ? "GET" : "POST",
    headers: { host: "core.test", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    async *[Symbol.asyncIterator]() {
      if (bytes) {
        // Split inside UTF-8 bytes to exercise decoding across incoming chunks.
        yield bytes.subarray(0, 3);
        yield bytes.subarray(3);
      }
    }
  };
  const res = {
    headers: {}, headersSent: false, status: null, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); this.headersSent = true; },
    end(value) { this.ended = true; this.raw = value; }
  };
  await app.handle(req, res, new URL(path, "https://core.test"));
  return { ...res, body: typeof res.raw === "string" ? JSON.parse(res.raw) : res.raw };
}

test("core instances isolate database, credentials, environment and shared concurrency", async t => {
  const first = fixture(t, { env: { ADMIN_KEY: "first-key", WECHAT_APP_ID: "id", WECHAT_APP_SECRET: "synthetic", PUBLIC_URL: "https://first.test" } });
  const second = fixture(t);
  assert.notEqual(first.factories[0].sharedConcurrency, second.factories[0].sharedConcurrency);
  const user = await first.register();
  assert.equal((await request(first.app, "/api/me", undefined, user.token)).status, 200);
  assert.equal((await request(second.app, "/api/me", undefined, user.token)).status, 401);
  assert.equal(second.db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_demo=0").get().count, 0);
  assert.equal((await request(first.app, "/api/auth/providers")).body.wechat, true);
  assert.equal((await request(second.app, "/api/auth/providers")).body.wechat, false);
  const status = await request(first.app, "/api/admin/agent/status", undefined, undefined, { "x-admin-key": "first-key" });
  assert.equal(status.status, 200);
  assert.equal(status.body.usage.globalCount, 17);
  assert.equal((await request(second.app, "/api/admin/agent/status", undefined, undefined, { "x-admin-key": "first-key" })).status, 401);
  assert.equal((await request(first.app, "/signal-mvp.html")).status, 404);
});

test("core awaits asynchronous media upload/download and registers cleanup", async t => {
  const upload = deferred();
  const bytes = new Uint8Array([1, 2, 3]);
  let cleaned = false;
  const f = fixture(t, { media: {
    async cleanup() { await Promise.resolve(); cleaned = true; },
    upload: () => upload.promise,
    async download() { await Promise.resolve(); return { bytes, attachment: { mimeType: "image/png" } }; }
  } });
  const room = await f.room();
  await f.background[0];
  assert.equal(cleaned, true);
  let completed = false;
  const pending = request(f.app, `${room.agent}/attachments`, { synthetic: true }, room.owner.token).then(response => { completed = true; return response; });
  await Promise.resolve();
  assert.equal(completed, false);
  upload.resolve({ id: "attachment-1" });
  const response = await pending;
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.attachment, { id: "attachment-1" });
  const download = await request(f.app, "/api/chat-attachments/attachment-1", undefined, room.owner.token);
  assert.equal(download.status, 200);
  assert.deepEqual(download.body, bytes);
  assert.equal(download.headers["content-type"], "image/png");
});

test("message and attachment association use the injected atomic transaction", async t => {
  const f = fixture(t, { media: { associate() { throw Object.assign(new Error("synthetic association conflict"), { status: 409 }); } } });
  const room = await f.room();
  const before = f.transactionCount();
  const response = await request(f.app, `/api/friends/${room.peer.user.id}/messages`, { kind: "image", attachmentId: "attachment-1" }, room.owner.token);
  assert.equal(response.status, 409);
  assert.equal(f.transactionCount(), before + 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM friend_messages WHERE friendship_id=?").get(room.id).count, 0);
});

test("auto reply waits for a durable recovery checkpoint and has no idle pending work", async t => {
  const checkpoint = deferred();
  let calls = 0;
  const f = fixture(t, { env: { ANHAO_LLM_ENABLED: "true" }, beforeAutoReply: () => checkpoint.promise, suggest: async () => {
    calls += 1;
    return { source: "model", draft: "持久恢复后的合成回复" };
  } });
  const room = await f.room();
  await request(f.app, `${room.agent}/enable`, { consent: true, mode: "auto" }, room.owner.token);
  assert.equal(f.app.hasPendingAutoReply(), false);
  await request(f.app, `/api/friends/${room.owner.user.id}/messages`, { body: "等待持久检查点" }, room.peer.token);
  assert.equal(f.app.hasPendingAutoReply(), true);
  assert.equal(calls, 0);
  checkpoint.resolve();
  await Promise.all([...f.background]);
  assert.equal(calls, 1);
  assert.equal(f.app.hasPendingAutoReply(), false);
});

test("repeated start/resume keeps a pending auto job registered and generating", async t => {
  const reply = deferred();
  let calls = 0;
  const f = fixture(t, { env: { ANHAO_LLM_ENABLED: "true" }, suggest: () => { calls += 1; return reply.promise; } });
  const room = await f.room();
  assert.equal((await request(f.app, `${room.agent}/enable`, { consent: true, mode: "auto" }, room.owner.token)).status, 200);
  assert.equal((await request(f.app, `/api/friends/${room.owner.user.id}/messages`, { body: "合成输入" }, room.peer.token)).status, 201);
  await Promise.resolve();
  assert.equal(calls, 1);
  const jobs = [...f.background];
  f.app.start();
  f.app.resume();
  f.app.start();
  assert.equal(f.db.prepare("SELECT auto_status FROM agent_thread_settings WHERE user_id=?").get(room.owner.user.id).auto_status, "generating");
  assert.equal(calls, 1);
  assert.equal(f.background.length, jobs.length);
  reply.resolve({ source: "model", draft: "合成模型回复" });
  await Promise.all(jobs);
  const messages = f.db.prepare("SELECT * FROM friend_messages WHERE friendship_id=? AND source='agent_auto'").all(room.id);
  assert.equal(messages.length, 1);
  assert.equal(f.db.prepare("SELECT auto_status FROM agent_thread_settings WHERE user_id=?").get(room.owner.user.id).auto_status, "idle");
});

test("without an R2 bucket media is disabled with a clear 503 while text chat keeps working", async t => {
  const f = fixture(t, { mediaFactory: options => createCloudMediaStore({ ...options, bucket: null }) });
  const health = await request(f.app, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.features.media, false);
  const room = await f.room();
  const upload = await request(f.app, `${room.agent}/attachments`, { data: "AAAA", mimeType: "image/png" }, room.owner.token);
  assert.equal(upload.status, 503);
  assert.equal(upload.body.error.code, "MEDIA_DISABLED");
  assert.match(upload.body.error.message, /图片功能暂未开通/);
  const download = await request(f.app, "/api/chat-attachments/att_" + "0".repeat(32), undefined, room.owner.token);
  assert.equal(download.status, 503);
  assert.equal(download.body.error.code, "MEDIA_DISABLED");
  const image = await request(f.app, `/api/friends/${room.peer.user.id}/messages`, { kind: "image", attachmentId: "att_" + "0".repeat(32) }, room.owner.token);
  assert.equal(image.status, 503);
  const text = await request(f.app, `/api/friends/${room.peer.user.id}/messages`, { body: "你好" }, room.owner.token);
  assert.equal(text.status, 201);
  const list = await request(f.app, `/api/friends/${room.owner.user.id}/messages`, undefined, room.peer.token);
  assert.equal(list.status, 200);
  assert.ok(JSON.stringify(list.body).includes("你好"));
});

test("health reports media enabled when a bucket is bound", async t => {
  const f = fixture(t, { mediaFactory: options => createCloudMediaStore({ ...options, bucket: { async put() {}, async get() { return null; }, async delete() {} } }) });
  assert.equal((await request(f.app, "/api/health")).body.features.media, true);
});
