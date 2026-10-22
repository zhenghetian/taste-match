import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateImage, MAX_MEDIA_BYTES } from "../chat-media.mjs";

const dataDir = mkdtempSync(join(tmpdir(), "anhao-chat-media-"));
Object.assign(process.env, { DATA_DIR: dataDir, ANHAO_LLM_ENABLED: "false", MODERATION_WEBHOOK_URL: "", NODE_ENV: "production", SMS_WEBHOOK_URL: "" });
let server, base, db, serial = 0;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=", "base64");
const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const image = { data: png.toString("base64"), mimeType: "image/png", name: "../../合成.png" };
const people = ["alpha", "beta", "stranger"];
const tokens = Object.fromEntries(people.map(p => [p, `synthetic-session-${p}`]));
async function start() {
  const { createServer } = await import(`../server.mjs?media-test=${++serial}`);
  server = createServer({ replyHarness: { suggest() { assert.fail("media tests must never invoke a model"); }, close() {} } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() { if (server?.listening) { server.closeAllConnections(); await new Promise(r => server.close(r)); } }
async function request(path, { who = "alpha", method = "GET", body, status = 200 } = {}) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, status, `${method} ${path}: ${Buffer.isBuffer(result) ? "binary" : JSON.stringify(result)}`);
  return { result, response };
}
function room(kind) {
  return { kind, id: `${kind}_synthetic`, upload: `/api/agent/threads/${kind}/${kind}_synthetic/attachments`, agent: `/api/agent/threads/${kind}/${kind}_synthetic`, messages: who => kind === "echo" ? "/api/echoes/echo_synthetic/messages" : `/api/friends/${who === "alpha" ? "beta" : "alpha"}/messages` };
}
async function upload(r, input = image) { return (await request(r.upload, { method: "POST", body: input, status: 201 })).result.attachment; }

test.before(async () => {
  await start();
  db = new DatabaseSync(join(dataDir, "anhao.db"));
  const timestamp = new Date().toISOString();
  for (const p of people) {
    db.prepare("INSERT INTO users(id,nickname,created_at,updated_at) VALUES(?,?,?,?)").run(p,p,timestamp,timestamp);
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(createHash("sha256").update(tokens[p]).digest("hex"),p,"2099-01-01T00:00:00.000Z",timestamp);
  }
  for (const p of ["alpha", "beta"]) db.prepare("INSERT INTO signals(id,user_id,content_id,creator,title,cover,reaction,created_at) VALUES(?,?,?,'合成','合成内容','','合成感受',?)").run(`sig_${p}`,p,"7653500525270670770",timestamp);
  db.prepare("INSERT INTO echoes(id,user_a,user_b,signal_a,signal_b,content_id,question,created_at) VALUES('echo_synthetic','alpha','beta','sig_alpha','sig_beta','7653500525270670770','合成问题',?)").run(timestamp);
  for (const p of ["alpha", "beta"]) db.prepare("INSERT INTO echo_answers VALUES('echo_synthetic',?,'合成回答',?)").run(p,timestamp);
  db.prepare("INSERT INTO friendships(id,user_a,user_b,invited_by,created_at) VALUES('friend_synthetic','alpha','beta','alpha',?)").run(timestamp);
});
test.after(async () => { await stop(); db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

for (const kind of ["echo", "friend"]) {
  test(`${kind}: private upload, media/link persistence, shared GET/SSE shape and manual takeover`, async () => {
    const r = room(kind);
    await request(r.upload, { who: null, method: "POST", body: image, status: 401 });
    await request(r.upload, { who: "stranger", method: "POST", body: image, status: 404 });
    const att = await upload(r);
    assert.equal(att.name.includes("/"), false);
    assert.equal(att.size, png.length);
    assert.ok(existsSync(join(dataDir, "chat-media", att.id)));
    await request(att.url, { who: null, status: 401 });
    await request(att.url, { who: "stranger", status: 404 });
    await request(att.url, { who: "beta", status: 404 });
    const downloaded = await request(`${att.url}?token=${tokens.alpha}`, { who: null });
    assert.deepEqual(downloaded.result, png);
    assert.equal(downloaded.response.headers.get("cache-control"), "private, no-store");
    await request(`/data/chat-media/${att.id}`, { who: null, status: 404 });
    await request(`/api/chat-attachments/${encodeURIComponent("../anhao.db")}`, { status: 404 });
    await request(r.messages("beta"), { who: "beta", method: "POST", body: { kind: "image", attachmentId: att.id }, status: 400 });
    await request(r.agent + "/enable", { method: "POST", body: { consent: true, mode: "auto" } });
    const controller = new AbortController();
    const events = await fetch(base + `/api/events?token=${tokens.beta}`, { signal: controller.signal });
    const reader = events.body.getReader();
    await reader.read();
    const sent = (await request(r.messages("alpha"), { method: "POST", body: { kind: "image", attachmentId: att.id, source: "agent_auto" }, status: 201 })).result.message;
    assert.equal(sent.body, "[图片]"); assert.equal(sent.kind, "image"); assert.equal(sent.source, "user"); assert.deepEqual(sent.attachment, att);
    let eventText = "";
    while (!eventText.includes(sent.id)) eventText += new TextDecoder().decode((await reader.read()).value);
    controller.abort(); await reader.cancel().catch(() => {});
    const eventMessage = eventText.split("\n").filter(l => l.startsWith("data: ")).map(l => JSON.parse(l.slice(6))).find(m => m.id === sent.id);
    assert.deepEqual(eventMessage, sent);
    assert.equal((await request(r.agent)).result.settings.enabled, false);
    assert.deepEqual((await request(att.url, { who: "beta" })).result, png);
    await request(r.messages("alpha"), { method: "POST", body: { kind: "image", attachmentId: att.id }, status: 400 });
    const link = (await request(r.messages("alpha"), { method: "POST", body: { kind: "link", link: { url: "https://example.com/synthetic?q=1", title: "合成分享" } }, status: 201 })).result.message;
    assert.equal(link.body, "[链接] 合成分享"); assert.equal(link.link.url, "https://example.com/synthetic?q=1");
    const sticker = await upload(r, { data: gif.toString("base64"), mimeType: "image/gif", name: "合成表情.gif" });
    const stickerSent = (await request(r.messages("alpha"), { method: "POST", body: { kind: "sticker", attachmentId: sticker.id }, status: 201 })).result.message;
    assert.equal(stickerSent.body, "[表情包]");
    const text = (await request(r.messages("alpha"), { method: "POST", body: { body: "旧客户端文本" }, status: 201 })).result.message;
    assert.equal(text.kind, "text");
    await stop(); await start();
    const rows = (await request(r.messages("beta"), { who: "beta" })).result.messages;
    assert.deepEqual(rows.find(m => m.id === sent.id).attachment, att);
    assert.deepEqual(rows.find(m => m.id === link.id).link, link.link);
    assert.equal(rows.find(m => m.id === text.id).kind, "text");
    assert.deepEqual((await request(att.url, { who: "beta" })).result, png);
    db.prepare("INSERT INTO blocks VALUES('beta','alpha',?)").run(new Date().toISOString());
    await request(att.url, { status: 404 }); await request(att.url, { who: "beta", status: 404 });
    await request(r.upload, { method: "POST", body: image, status: 403 });
    await request(r.messages("alpha"), { method: "POST", body: { kind: "link", link: { url: "https://example.com" } }, status: 403 });
    db.prepare("DELETE FROM blocks").run();
    if (kind === "friend") {
      db.prepare("DELETE FROM friendships WHERE id=?").run(r.id);
      await request(att.url, { status: 404 }); await request(att.url, { who: "beta", status: 404 });
      db.prepare("INSERT INTO friendships(id,user_a,user_b,invited_by,created_at) VALUES(?,'alpha','beta','alpha',?)").run(r.id,new Date().toISOString());
    }
  });
}

test("reject spoofed/truncated images, invalid base64, oversize uploads and dangerous links", async () => {
  const r = room("friend");
  for (const input of [
    { data: Buffer.from("<svg onload='alert(1)'/>").toString("base64"), mimeType: "image/svg+xml" },
    { data: Buffer.from("not a png").toString("base64"), mimeType: "image/png" },
    { ...image, mimeType: "image/jpeg" }, { ...image, data: png.subarray(0, 24).toString("base64") },
    { ...image, data: "data:image/png;base64," + image.data }, { ...image, data: "!!!!" }
  ]) await request(r.upload, { method: "POST", body: input, status: 400 });
  const huge = Buffer.from(png); huge.writeUInt32BE(100_000, 16);
  await request(r.upload, { method: "POST", body: { ...image, data: huge.toString("base64") }, status: 400 });
  await request(r.upload, { method: "POST", body: { ...image, data: Buffer.alloc(MAX_MEDIA_BYTES + 1).toString("base64") }, status: 413 });
  await request(r.messages("alpha"), { method: "POST", body: { body: "x".repeat(70_000) }, status: 413 });
  for (const url of ["javascript:alert(1)", "data:text/html,abc", "file:///etc/passwd", "https://user:pass@example.com", "https://example.com\n.evil", "//example.com"]) {
    await request(r.messages("alpha"), { method: "POST", body: { kind: "link", link: { url } }, status: 400 });
  }
  const other = await upload(room("echo"));
  await request(r.messages("alpha"), { method: "POST", body: { kind: "sticker", attachmentId: other.id }, status: 400 });
});

test("cleanup deletes only expired unsent media, upload rate/quota persist in database", async () => {
  const r = room("friend"), pending = await upload(r);
  const sent = await upload(r);
  await request(r.messages("alpha"), { method: "POST", body: { kind: "image", attachmentId: sent.id }, status: 201 });
  db.prepare("UPDATE chat_attachments SET created_at='2000-01-01T00:00:00.000Z'").run();
  await upload(r);
  assert.equal(existsSync(join(dataDir,"chat-media",pending.id)), false);
  assert.equal(existsSync(join(dataDir,"chat-media",sent.id)), true);
  assert.deepEqual((await request(sent.url, { who: "beta" })).result, png);
  const current = db.prepare("SELECT COUNT(*) AS n FROM chat_attachments WHERE owner_id='alpha' AND created_at>?").get(new Date(Date.now()-600_000).toISOString()).n;
  for (let i = current; i < 20; i++) await upload(r);
  await request(r.upload, { method: "POST", body: image, status: 429 });
  await stop(); await start();
  await request(r.upload, { method: "POST", body: image, status: 429 });
  db.prepare("UPDATE chat_attachments SET created_at='2000-01-01T00:00:00.000Z'").run();
  db.prepare("UPDATE chat_attachments SET size=25165824 WHERE id=?").run(sent.id);
  await request(r.upload, { method: "POST", body: image, status: 507 });
});

test("image container parsing rejects header-only and excessive animation payloads", () => {
  assert.doesNotThrow(() => validateImage(png,"image/png"));
  assert.doesNotThrow(() => validateImage(gif,"image/gif"));
  for (const [bytes,mime] of [[Buffer.from("GIF89a"),"image/gif"],[Buffer.from("RIFF0000WEBPVP8 "),"image/webp"],[Buffer.from([255,216,255,217]),"image/jpeg"]]) assert.throws(() => validateImage(bytes,mime));
});
