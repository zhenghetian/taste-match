import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createCloudMediaStore } from "../cloudflare/media.mjs";
import { validateImage, safeLink, MAX_MEDIA_BYTES, MEDIA_JSON_LIMIT } from "../chat-media-validation.mjs";
import * as legacy from "../chat-media.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=", "base64");
const image = { data: png.toString("base64"), mimeType: "image/png", name: "../../合成.png" };
const alpha = { id: "alpha" }, beta = { id: "beta" };
function gate() {
  let release, entered;
  const wait = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  return { wait, release, entered, started };
}
function fixture(t, { oldSchema = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('alpha'),('beta'); CREATE TABLE relations(kind TEXT,id TEXT,PRIMARY KEY(kind,id)); INSERT INTO relations VALUES('friend','room'),('echo','other');");
  if (oldSchema) sqlite.exec("CREATE TABLE chat_attachments(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,thread_kind TEXT NOT NULL,thread_id TEXT NOT NULL,mime_type TEXT NOT NULL,name TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL,message_id TEXT);");
  const db = { exec: sql => sqlite.exec(sql), prepare: sql => sqlite.prepare(sql) };
  const bucket = {
    objects: new Map(), puts: [], gets: [], deletes: [],
    async put(id, bytes, options) {
      this.puts.push({ id, options });
      if (this.putGate) { this.putGate.entered(); await this.putGate.wait; }
      this.objects.set(id, Uint8Array.from(bytes));
      if (this.failPut) throw new Error("synthetic provider secret");
    },
    async get(id) {
      this.gets.push(id);
      if (this.getGate) { this.getGate.entered(); await this.getGate.wait; }
      const bytes = this.objects.get(id);
      return bytes ? { arrayBuffer: async () => {
        if (this.bodyGate) { this.bodyGate.entered(); await this.bodyGate.wait; }
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } } : null;
    },
    async delete(id) {
      this.deletes.push(id);
      if (this.deleteGate) { this.deleteGate.entered(); await this.deleteGate.wait; }
      if (this.failDelete) throw new Error("synthetic provider secret");
      this.objects.delete(id);
    }
  };
  const assertAccess = (kind, id, user) => ["alpha", "beta"].includes(user.id) && db.prepare("SELECT 1 FROM relations WHERE kind=? AND id=?").get(kind, id)
    ? {} : { error: ["RELATION_NOT_FOUND", "关系不存在", 404] };
  const store = createCloudMediaStore({ db, bucket, assertAccess });
  t.after(() => sqlite.close());
  return { db, bucket, store, upload: (input = image) => store.upload("friend", "room", alpha, input), count: () => db.prepare("SELECT COUNT(*) AS n FROM chat_attachments").get().n };
}
const code = expected => error => error.code === expected;

test("validation extraction preserves Node exports and supported image validation", () => {
  for (const name of ["validateImage", "safeLink", "MAX_MEDIA_BYTES", "MEDIA_JSON_LIMIT"]) {
    assert.equal(legacy[name], { validateImage, safeLink, MAX_MEDIA_BYTES, MEDIA_JSON_LIMIT }[name]);
  }
  validateImage(png, "image/png");
  assert.equal(safeLink({ url: "https://example.com" }).url, "https://example.com/");
});

test("cloud API preserves descriptors, synchronous helpers and private download", async t => {
  const { store, bucket, upload } = fixture(t, { oldSchema: true });
  const attachment = await upload();
  assert.match(attachment.id, /^att_[a-f0-9]{32}$/);
  assert.deepEqual(attachment, { id: attachment.id, url: `/api/chat-attachments/${attachment.id}`, mimeType: "image/png", name: "....合成.png", size: png.length });
  assert.equal(bucket.puts[0].options.httpMetadata.contentType, "image/png");
  assert.deepEqual(store.forMessage(attachment.id, "friend", "room", "alpha"), attachment);
  for (const args of [["friend", "room", "beta"], ["echo", "room", "alpha"], ["friend", "other", "alpha"]]) {
    assert.throws(() => store.forMessage(attachment.id, ...args), code("INVALID_ATTACHMENT"));
  }
  await assert.rejects(store.download(attachment.id, beta), code("ATTACHMENT_NOT_FOUND"));
  assert.equal(bucket.gets.length, 0);
  store.associate(attachment.id, "message");
  assert.throws(() => store.forMessage(attachment.id, "friend", "room", "alpha"));
  assert.throws(() => store.associate(attachment.id, "twice"));
  assert.deepEqual(store.serialize({ id: "message", kind: "image", payload: JSON.stringify({ attachmentId: attachment.id }) }), { id: "message", kind: "image", attachment });
  assert.deepEqual(store.serialize({ body: "text" }), { body: "text", kind: "text" });
  assert.deepEqual(store.serialize({ kind: "link", payload: { link: { url: "https://example.com/" } } }).link, { url: "https://example.com/" });
  const downloaded = await store.download(attachment.id, beta);
  assert.ok(downloaded.bytes instanceof Uint8Array);
  assert.deepEqual(Buffer.from(downloaded.bytes), png);
  assert.deepEqual(downloaded.attachment, attachment);
});

test("invalid images, dimensions and base64 fail before R2 writes or metadata", async t => {
  const { upload, bucket, count } = fixture(t);
  const huge = Buffer.from(png); huge.writeUInt32BE(100_000, 16);
  for (const input of [null, { ...image, data: "!!!!" }, { ...image, data: "AB==" }, { ...image, data: "data:image/png;base64," + image.data }, { ...image, mimeType: "image/svg+xml" }, { ...image, data: huge.toString("base64") }, { ...image, data: png.subarray(0, 24).toString("base64") }, { ...image, data: Buffer.alloc(MAX_MEDIA_BYTES + 1).toString("base64") }]) {
    await assert.rejects(upload(input));
  }
  assert.equal(bucket.puts.length, 0); assert.equal(count(), 0);
});

test("pending reservations enforce concurrent rate limit and are unusable", async t => {
  const { upload, bucket, db, store, count } = fixture(t);
  bucket.putGate = gate();
  const uploads = Array.from({ length: 20 }, () => upload());
  await bucket.putGate.started;
  const row = db.prepare("SELECT * FROM chat_attachments LIMIT 1").get();
  assert.equal(row.ready, 0);
  assert.throws(() => store.forMessage(row.id, "friend", "room", "alpha"));
  assert.throws(() => store.associate(row.id, "pending-message"));
  assert.equal(store.serialize({ kind: "image", payload: { attachmentId: row.id } }).attachment, undefined);
  await assert.rejects(store.download(row.id, alpha), code("ATTACHMENT_NOT_FOUND"));
  await assert.rejects(upload(), code("UPLOAD_RATE_LIMIT"));
  assert.equal(count(), 20); assert.equal(bucket.puts.length, 20);
  bucket.putGate.release();
  assert.equal((await Promise.all(uploads)).length, 20);
});

for (const limit of ["own", "global"]) {
  test(`pending uploads reserve ${limit} byte quota and recheck after put`, async t => {
    const { upload, bucket, db } = fixture(t);
    const base = await upload();
    const quota = (limit === "own" ? 24 : 256) * 1024 * 1024;
    db.prepare("UPDATE chat_attachments SET size=?,owner_id=? WHERE id=?").run(quota - png.length, limit === "own" ? "alpha" : "beta", base.id);
    bucket.putGate = gate();
    const pending = upload();
    await bucket.putGate.started;
    await assert.rejects(upload(), code("MEDIA_QUOTA_EXCEEDED"));
    bucket.putGate.release(); await pending;
    await assert.rejects(upload(), code("MEDIA_QUOTA_EXCEEDED"));
  });
}

test("R2 failures release reservations, remove partial objects and hide provider errors", async t => {
  const { upload, bucket, count, store } = fixture(t);
  bucket.failPut = true;
  await assert.rejects(upload(), error => error.code === "MEDIA_STORAGE_ERROR" && !error.message.includes("secret"));
  assert.equal(count(), 0); assert.equal(bucket.objects.size, 0); assert.equal(bucket.deletes.length, 1);
  bucket.failDelete = true;
  await assert.rejects(upload(), code("MEDIA_STORAGE_ERROR"));
  assert.equal(count(), 1);
  bucket.failDelete = false;
  await store.cleanup();
  assert.equal(count(), 0); assert.equal(bucket.objects.size, 0);
});

test("upload checks permissions again after put and rolls back on revocation", async t => {
  const { upload, bucket, db, count } = fixture(t);
  bucket.putGate = gate();
  const pending = upload(); await bucket.putGate.started;
  db.exec("DELETE FROM relations WHERE kind='friend'");
  bucket.putGate.release();
  await assert.rejects(pending, code("RELATION_NOT_FOUND"));
  assert.equal(count(), 0); assert.equal(bucket.objects.size, 0);
  await assert.rejects(upload(), code("RELATION_NOT_FOUND"));
  assert.equal(bucket.puts.length, 1);
});

test("revoked uploads retain cleanup metadata when compensating R2 delete fails", async t => {
  const { upload, bucket, db, store, count } = fixture(t);
  bucket.putGate = gate();
  const pending = upload(); await bucket.putGate.started;
  db.exec("DELETE FROM relations WHERE kind='friend'");
  bucket.failDelete = true;
  bucket.putGate.release();
  await assert.rejects(pending, code("RELATION_NOT_FOUND"));
  assert.equal(count(), 1); assert.equal(bucket.objects.size, 1);
  const row = db.prepare("SELECT * FROM chat_attachments").get();
  assert.equal(row.ready, -2); assert.equal(row.size, png.length);
  assert.throws(() => store.forMessage(row.id, "friend", "room", "alpha"));
  bucket.failDelete = false;
  await store.cleanup();
  assert.equal(count(), 0); assert.equal(bucket.objects.size, 0);
});

test("limits changed during put are rechecked and failed upload is unreserved", async t => {
  const { upload, bucket, db, count } = fixture(t);
  const base = await upload();
  bucket.putGate = gate();
  const pending = upload(); await bucket.putGate.started;
  db.prepare("UPDATE chat_attachments SET size=? WHERE id=?").run(24 * 1024 * 1024, base.id);
  bucket.putGate.release();
  await assert.rejects(pending, code("MEDIA_QUOTA_EXCEEDED"));
  assert.equal(count(), 1); assert.equal(bucket.objects.size, 1);
});

for (const phase of ["getGate", "bodyGate"]) {
  test(`download rechecks live relationship after R2 ${phase}`, async t => {
    const { upload, store, bucket, db } = fixture(t);
    const attachment = await upload(); store.associate(attachment.id, "message");
    bucket[phase] = gate();
    const pending = store.download(attachment.id, beta); await bucket[phase].started;
    db.exec("DELETE FROM relations WHERE kind='friend'");
    bucket[phase].release();
    await assert.rejects(pending, code("ATTACHMENT_NOT_FOUND"));
    assert.throws(() => store.forMessage(attachment.id, "friend", "room", "alpha"));
    const before = bucket.gets.length;
    await assert.rejects(store.download(attachment.id, alpha), code("ATTACHMENT_NOT_FOUND"));
    assert.equal(bucket.gets.length, before);
  });
}

test("cleanup claims expired unsent metadata, retains failed deletes and never removes sent", async t => {
  const { upload, store, bucket, db, count } = fixture(t);
  const unsent = await upload(), sent = await upload(); store.associate(sent.id, "message");
  db.exec("UPDATE chat_attachments SET created_at='2000-01-01T00:00:00.000Z'");
  assert.throws(() => store.forMessage(unsent.id, "friend", "room", "alpha"));
  await assert.rejects(store.download(unsent.id, alpha), code("ATTACHMENT_NOT_FOUND"));
  bucket.failDelete = true; await store.cleanup();
  assert.equal(count(), 2); assert.equal(db.prepare("SELECT ready FROM chat_attachments WHERE id=?").get(unsent.id).ready, 1);
  bucket.failDelete = false; bucket.deleteGate = gate();
  const cleaning = store.cleanup(); await bucket.deleteGate.started;
  assert.equal(store.cleanup(), cleaning);
  assert.equal(db.prepare("SELECT ready FROM chat_attachments WHERE id=?").get(unsent.id).ready, -1);
  assert.throws(() => store.associate(unsent.id, "racing"));
  assert.equal(store.serialize({ kind: "image", payload: { attachmentId: unsent.id } }).attachment, undefined);
  bucket.deleteGate.release(); await cleaning;
  assert.equal(count(), 1); assert.ok(bucket.objects.has(sent.id));
  assert.deepEqual(Buffer.from((await store.download(sent.id, beta)).bytes), png);
});

test("upload runs cleanup and cleanup limits each pass to 1000 records", async t => {
  const { db, bucket, store, upload, count } = fixture(t);
  const insert = db.prepare("INSERT INTO chat_attachments(id,owner_id,thread_kind,thread_id,mime_type,name,size,created_at,ready) VALUES(?,'alpha','friend','room','image/png','synthetic',1,'2000-01-01T00:00:00.000Z',0)");
  for (let i = 0; i < 1005; i++) insert.run(`att_${i.toString(16).padStart(32, "0")}`);
  await store.cleanup(); assert.equal(count(), 5); assert.equal(bucket.deletes.length, 1000);
  await upload(); assert.equal(count(), 1); assert.equal(bucket.deletes.length, 1005);
});
