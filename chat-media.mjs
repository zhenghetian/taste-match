import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { MAX_MEDIA_BYTES, validateImage } from "./chat-media-validation.mjs";
export { MAX_MEDIA_BYTES, MEDIA_JSON_LIMIT, validateImage, safeLink } from "./chat-media-validation.mjs";

const DAY = 86_400_000;
function reject(message, status = 400, code = "INVALID_ATTACHMENT") {
  throw Object.assign(new Error(message), { status, code });
}

export function createChatMediaStore({ db, dataDir, assertAccess }) {
  const directory = join(dataDir, "chat-media");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  db.exec(`CREATE TABLE IF NOT EXISTS chat_attachments (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_kind TEXT NOT NULL, thread_id TEXT NOT NULL, mime_type TEXT NOT NULL,
    name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, message_id TEXT
  ); CREATE INDEX IF NOT EXISTS idx_chat_attachments_owner ON chat_attachments(owner_id,created_at);`);
  const descriptor = row => ({ id: row.id, url: `/api/chat-attachments/${row.id}`, mimeType: row.mime_type, name: row.name, size: row.size });
  function cleanup() {
    const cutoff = new Date(Date.now() - DAY).toISOString();
    for (const row of db.prepare("SELECT id FROM chat_attachments WHERE message_id IS NULL AND created_at<?").all(cutoff)) {
      try { unlinkSync(join(directory, row.id)); } catch (error) { if (error.code !== "ENOENT") continue; }
      db.prepare("DELETE FROM chat_attachments WHERE id=? AND message_id IS NULL").run(row.id);
    }
  }
  function get(id) { return typeof id === "string" && /^att_[a-f0-9]{32}$/.test(id) ? db.prepare("SELECT * FROM chat_attachments WHERE id=?").get(id) : null; }
  function upload(kind, threadId, user, input) {
    cleanup();
    if (!input || typeof input.data !== "string" || input.data.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4) reject("图片最大为 3MB", 413);
    if (!input.data || input.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) reject("请使用纯 base64 图片数据");
    const bytes = Buffer.from(input.data, "base64");
    if (bytes.toString("base64") !== input.data) reject("base64 编码无效");
    validateImage(bytes, input.mimeType);
    const recent = db.prepare("SELECT COUNT(*) AS count FROM chat_attachments WHERE owner_id=? AND created_at>?").get(user.id, new Date(Date.now() - 600_000).toISOString());
    if (recent.count >= 20) reject("图片上传过于频繁，请稍后重试", 429, "UPLOAD_RATE_LIMIT");
    const totals = db.prepare("SELECT COALESCE(SUM(size),0) AS total, COALESCE(SUM(CASE WHEN owner_id=? THEN size ELSE 0 END),0) AS own FROM chat_attachments").get(user.id);
    if (totals.total + bytes.length > 256 * 1024 * 1024 || totals.own + bytes.length > 24 * 1024 * 1024) reject("图片存储空间已满", 507, "MEDIA_QUOTA_EXCEEDED");
    const row = { id: `att_${randomBytes(16).toString("hex")}`, owner_id: user.id, thread_kind: kind, thread_id: threadId, mime_type: input.mimeType, name: String(input.name || "图片").replace(/[\u0000-\u001f\u007f/\\]/g, "").slice(0, 120) || "图片", size: bytes.length, created_at: new Date().toISOString() };
    writeFileSync(join(directory, row.id), bytes, { flag: "wx", mode: 0o600 });
    try { db.prepare("INSERT INTO chat_attachments(id,owner_id,thread_kind,thread_id,mime_type,name,size,created_at) VALUES(?,?,?,?,?,?,?,?)").run(row.id,row.owner_id,kind,threadId,row.mime_type,row.name,row.size,row.created_at); }
    catch (error) { unlinkSync(join(directory, row.id)); throw error; }
    return descriptor(row);
  }
  function forMessage(id, kind, threadId, userId) {
    const row = get(id);
    if (!row || row.owner_id !== userId || row.thread_kind !== kind || row.thread_id !== threadId || row.message_id || Date.parse(row.created_at) < Date.now() - DAY) reject("附件不存在或不能用于这段对话", 400);
    return descriptor(row);
  }
  function download(id, user) {
    const row = get(id);
    if (!row || (!row.message_id && row.owner_id !== user.id) || assertAccess(row.thread_kind, row.thread_id, user).error) reject("附件不存在或无权访问", 404, "ATTACHMENT_NOT_FOUND");
    if (!row.message_id && Date.parse(row.created_at) < Date.now() - DAY) reject("附件已过期", 404, "ATTACHMENT_NOT_FOUND");
    let bytes;
    try { bytes = readFileSync(join(directory, row.id)); } catch { reject("附件不存在", 404, "ATTACHMENT_NOT_FOUND"); }
    return { bytes, attachment: descriptor(row) };
  }
  function serialize(message) {
    const { payload, ...result } = message;
    result.kind ||= "text";
    const data = typeof payload === "string" ? JSON.parse(payload || "{}") : payload || {};
    if (result.kind === "link") result.link = data.link;
    if (["image", "sticker"].includes(result.kind)) { const row = get(data.attachmentId); if (row) result.attachment = descriptor(row); }
    return result;
  }
  return { upload, forMessage, download, serialize, cleanup, associate(id, messageId) { db.prepare("UPDATE chat_attachments SET message_id=? WHERE id=? AND message_id IS NULL").run(messageId,id); } };
}
