import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { MAX_MEDIA_BYTES, validateImage } from "../chat-media-validation.mjs";

const DAY = 86_400_000;
const USER_QUOTA = 24 * 1024 * 1024;
const GLOBAL_QUOTA = 256 * 1024 * 1024;
const CLEANUP_BATCH = 100;
const CLEANUP_BATCHES = 10;

function reject(message, status = 400, code = "INVALID_ATTACHMENT") {
  throw Object.assign(new Error(message), { status, code });
}
function storageError() { reject("附件存储暂时不可用", 503, "MEDIA_STORAGE_ERROR"); }

// db uses the synchronous native SQLite prepare/get/all/run interface.
export function createCloudMediaStore({ db, bucket, assertAccess }) {
  db.exec(`CREATE TABLE IF NOT EXISTS chat_attachments (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_kind TEXT NOT NULL, thread_id TEXT NOT NULL, mime_type TEXT NOT NULL,
    name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, message_id TEXT,
    ready INTEGER NOT NULL DEFAULT 1
  ); CREATE INDEX IF NOT EXISTS idx_chat_attachments_owner ON chat_attachments(owner_id,created_at);`);
  // Only the cloud database gains this column; the Node store schema stays unchanged.
  if (!db.prepare("PRAGMA table_info(chat_attachments)").all().some(column => column.name === "ready")) {
    db.exec("ALTER TABLE chat_attachments ADD COLUMN ready INTEGER NOT NULL DEFAULT 1");
  }
  const descriptor = row => ({ id: row.id, url: `/api/chat-attachments/${row.id}`, mimeType: row.mime_type, name: row.name, size: row.size });
  const get = id => typeof id === "string" && /^att_[a-f0-9]{32}$/.test(id)
    ? db.prepare("SELECT * FROM chat_attachments WHERE id=?").get(id) : null;
  const expired = row => Date.parse(row.created_at) < Date.now() - DAY;
  function access(kind, threadId, user) {
    const result = assertAccess(kind, threadId, user);
    if (result?.error) {
      const [code, message, status] = result.error;
      reject(message, status || 403, code);
    }
  }
  function quotas(userId, extraBytes = 0, reserved = false) {
    const recent = db.prepare("SELECT COUNT(*) AS count FROM chat_attachments WHERE owner_id=? AND created_at>?")
      .get(userId, new Date(Date.now() - 600_000).toISOString());
    if (recent.count + (reserved ? 0 : 1) > 20) reject("图片上传过于频繁，请稍后重试", 429, "UPLOAD_RATE_LIMIT");
    const totals = db.prepare("SELECT COALESCE(SUM(size),0) AS total, COALESCE(SUM(CASE WHEN owner_id=? THEN size ELSE 0 END),0) AS own FROM chat_attachments").get(userId);
    if (totals.total + extraBytes > GLOBAL_QUOTA || totals.own + extraBytes > USER_QUOTA) reject("图片存储空间已满", 507, "MEDIA_QUOTA_EXCEEDED");
  }

  let cleaning;
  function cleanup() {
    // Serialize cleanup calls: a second pass must not reclaim an in-flight delete.
    if (!cleaning) cleaning = sweep().finally(() => { cleaning = null; });
    return cleaning;
  }
  async function sweep() {
    const cutoff = new Date(Date.now() - DAY).toISOString();
    let cursor = "";
    for (let batch = 0; batch < CLEANUP_BATCHES; batch++) {
      const rows = db.prepare("SELECT id,ready FROM chat_attachments WHERE message_id IS NULL AND (created_at<? OR ready=-2) AND id>? ORDER BY id LIMIT ?")
        .all(cutoff, cursor, CLEANUP_BATCH);
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row.id;
        // Claim synchronously so a message cannot bind while R2 deletion yields.
        const claimed = db.prepare("UPDATE chat_attachments SET ready=-1 WHERE id=? AND message_id IS NULL AND (created_at<? OR ready=-2) AND ready=?")
          .run(row.id, cutoff, row.ready);
        if (!claimed.changes) continue;
        try {
          await bucket.delete(row.id);
        } catch {
          db.prepare("UPDATE chat_attachments SET ready=? WHERE id=? AND ready=-1 AND message_id IS NULL").run(row.ready, row.id);
          continue;
        }
        db.prepare("DELETE FROM chat_attachments WHERE id=? AND message_id IS NULL AND ready=-1").run(row.id);
      }
      if (rows.length < CLEANUP_BATCH) break;
    }
  }

  async function upload(kind, threadId, user, input) {
    access(kind, threadId, user);
    await cleanup();
    if (!input || typeof input.data !== "string" || input.data.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4) reject("图片最大为 3MB", 413);
    if (!input.data || input.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) reject("请使用纯 base64 图片数据");
    const bytes = Buffer.from(input.data, "base64");
    if (bytes.toString("base64") !== input.data) reject("base64 编码无效");
    validateImage(bytes, input.mimeType);
    // Nothing yields between checking limits and reserving. In-flight puts count.
    access(kind, threadId, user);
    quotas(user.id, bytes.length);
    const row = {
      id: `att_${randomBytes(16).toString("hex")}`, owner_id: user.id,
      thread_kind: kind, thread_id: threadId, mime_type: input.mimeType,
      name: String(input.name || "图片").replace(/[\u0000-\u001f\u007f/\\]/g, "").slice(0, 120) || "图片",
      size: bytes.length, created_at: new Date().toISOString()
    };
    db.prepare("INSERT INTO chat_attachments(id,owner_id,thread_kind,thread_id,mime_type,name,size,created_at,ready) VALUES(?,?,?,?,?,?,?,?,0)")
      .run(row.id, row.owner_id, kind, threadId, row.mime_type, row.name, row.size, row.created_at);
    try {
      try {
        await bucket.put(row.id, bytes, { httpMetadata: { contentType: row.mime_type } });
      } catch { storageError(); }
      access(kind, threadId, user);
      quotas(user.id, 0, true);
      const current = get(row.id);
      if (!current || current.ready !== 0 || current.message_id || expired(current)) reject("附件已过期或不可用");
      const changed = db.prepare("UPDATE chat_attachments SET ready=1 WHERE id=? AND ready=0 AND message_id IS NULL").run(row.id);
      if (!changed.changes) reject("附件已过期或不可用");
      return descriptor(row);
    } catch (error) {
      // Retain a quota-counted tombstone until R2 confirms deletion.
      db.prepare("UPDATE chat_attachments SET ready=-2 WHERE id=? AND message_id IS NULL").run(row.id);
      try {
        await bucket.delete(row.id);
        db.prepare("DELETE FROM chat_attachments WHERE id=? AND message_id IS NULL AND ready=-2").run(row.id);
      } catch { /* A later cleanup retries without exposing provider details. */ }
      throw error;
    }
  }

  function forMessage(id, kind, threadId, userId) {
    const row = get(id);
    if (!row || row.ready !== 1 || row.owner_id !== userId || row.thread_kind !== kind || row.thread_id !== threadId || row.message_id || expired(row)) reject("附件不存在或不能用于这段对话");
    access(kind, threadId, { id: userId });
    return descriptor(row);
  }
  function readable(id, user) {
    const row = get(id);
    if (!row || row.ready !== 1 || (!row.message_id && (row.owner_id !== user.id || expired(row)))) reject("附件不存在或无权访问", 404, "ATTACHMENT_NOT_FOUND");
    try { access(row.thread_kind, row.thread_id, user); }
    catch { reject("附件不存在或无权访问", 404, "ATTACHMENT_NOT_FOUND"); }
    return row;
  }
  async function download(id, user) {
    readable(id, user);
    let object, bytes;
    try {
      object = await bucket.get(id);
      if (object) bytes = new Uint8Array(await object.arrayBuffer());
    } catch { storageError(); }
    // Re-read both metadata and the live relationship after every R2 await.
    const row = readable(id, user);
    if (!object) reject("附件不存在", 404, "ATTACHMENT_NOT_FOUND");
    return { bytes, attachment: descriptor(row) };
  }
  function serialize(message) {
    const { payload, ...result } = message;
    result.kind ||= "text";
    const data = typeof payload === "string" ? JSON.parse(payload || "{}") : payload || {};
    if (result.kind === "link") result.link = data.link;
    if (["image", "sticker"].includes(result.kind)) {
      const row = get(data.attachmentId);
      if (row?.ready === 1) result.attachment = descriptor(row);
    }
    return result;
  }
  function associate(id, messageId) {
    const changed = db.prepare("UPDATE chat_attachments SET message_id=? WHERE id=? AND message_id IS NULL AND ready=1 AND created_at>=?")
      .run(messageId, id, new Date(Date.now() - DAY).toISOString());
    if (!changed.changes) reject("附件不存在或不能用于这段对话");
  }
  return { upload, forMessage, download, serialize, cleanup, associate };
}
