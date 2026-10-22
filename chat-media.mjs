import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
export const MEDIA_JSON_LIMIT = 4 * 1024 * 1024 + 4096;
const MAX_PIXELS = 16_000_000;
const DAY = 86_400_000;
function reject(message, status = 400, code = "INVALID_ATTACHMENT") {
  throw Object.assign(new Error(message), { status, code });
}
function dimensions(w, h) {
  if (!w || !h || w > 4096 || h > 4096 || w * h > MAX_PIXELS) reject("图片尺寸不合理");
}

// Parse container boundaries as well as signatures; declared MIME alone is never trusted.
export function validateImage(bytes, mimeType) {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) reject("图片最大为 3MB", 413);
  const n = bytes.length;
  if (mimeType === "image/png") {
    if (n < 57 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) reject("PNG 内容无效");
    let p = 8, width, height, depth, color, interlace, ended = false;
    const data = [];
    while (p + 12 <= n) {
      const size = bytes.readUInt32BE(p), type = bytes.toString("ascii", p + 4, p + 8);
      if (p + 12 + size > n) reject("PNG 数据不完整");
      if (p === 8 && (type !== "IHDR" || size !== 13)) reject("PNG 头无效");
      if (type === "IHDR") {
        if (width !== undefined || size !== 13) reject("PNG 头无效");
        width = bytes.readUInt32BE(p + 8); height = bytes.readUInt32BE(p + 12);
        dimensions(width, height);
        depth = bytes[p + 16]; color = bytes[p + 17]; interlace = bytes[p + 20];
        const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!depths[color]?.includes(depth) || bytes[p + 18] || bytes[p + 19] || interlace > 1) reject("PNG 编码无效");
      }
      if (type === "IDAT") data.push(bytes.subarray(p + 8, p + 8 + size));
      p += size + 12;
      if (type === "IEND") { if (size || p !== n) reject("PNG 结尾无效"); ended = true; break; }
    }
    if (!ended || !data.length) reject("PNG 数据不完整");
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
    const rowBytes = Math.ceil(width * channels * depth / 8);
    try {
      const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (rowBytes + 8) * height + 1024 });
      if (!raw.length || (!interlace && raw.length !== (rowBytes + 1) * height)) reject("PNG 像素数据无效");
      if (!interlace) for (let i = 0; i < raw.length; i += rowBytes + 1) if (raw[i] > 4) reject("PNG 像素数据无效");
    } catch { reject("PNG 像素数据无效"); }
  } else if (mimeType === "image/jpeg") {
    if (n < 20 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[n - 2] !== 255 || bytes[n - 1] !== 217) reject("JPEG 内容无效");
    let p = 2, found = false, scan = false;
    while (p < n - 2) {
      if (bytes[p++] !== 255) reject("JPEG 分段无效");
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (p + 2 > n) reject("JPEG 数据不完整");
      const size = bytes.readUInt16BE(p);
      if (size < 2 || p + size > n - 2) reject("JPEG 数据不完整");
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if (size < 8) reject("JPEG 尺寸无效");
        dimensions(bytes.readUInt16BE(p + 5), bytes.readUInt16BE(p + 3)); found = true;
      }
      if (marker === 218) { scan = p + size < n - 2; break; }
      p += size;
    }
    if (!found || !scan) reject("JPEG 图像数据缺失");
  } else if (mimeType === "image/gif") {
    if (n < 14 || !["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) reject("GIF 内容无效");
    dimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
    let p = 13 + ((bytes[10] & 128) ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0), frames = 0, pixels = 0;
    function subblocks() {
      let count = 0;
      while (p < n) { const size = bytes[p++]; if (!size) return count; if (p + size > n) reject("GIF 数据不完整"); p += size; count += size; }
      reject("GIF 数据不完整");
    }
    while (p < n) {
      const type = bytes[p++];
      if (type === 59) { if (p !== n || !frames) reject("GIF 结尾无效"); return; }
      if (type === 33) { if (p >= n) reject("GIF 扩展无效"); p++; subblocks(); }
      else if (type === 44) {
        if (p + 9 > n) reject("GIF 数据不完整");
        const w = bytes.readUInt16LE(p + 4), h = bytes.readUInt16LE(p + 6); dimensions(w, h);
        pixels += w * h; if (++frames > 300 || pixels > 64_000_000) reject("GIF 动画过大");
        const packed = bytes[p + 8]; p += 9 + ((packed & 128) ? 3 * (1 << ((packed & 7) + 1)) : 0);
        if (p >= n || bytes[p] < 2 || bytes[p] > 8) reject("GIF 编码无效"); p++;
        if (!subblocks()) reject("GIF 图像数据缺失");
      } else reject("GIF 分段无效");
    }
    reject("GIF 数据不完整");
  } else if (mimeType === "image/webp") {
    if (n < 26 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== n) reject("WebP 内容无效");
    let p = 12, found = false;
    while (p + 8 <= n) {
      const type = bytes.toString("ascii", p, p + 4), size = bytes.readUInt32LE(p + 4), start = p + 8;
      if (start + size > n) reject("WebP 数据不完整");
      if (type === "VP8 " && size >= 10) {
        if (!bytes.subarray(start + 3, start + 6).equals(Buffer.from([157, 1, 42]))) reject("WebP 编码无效");
        dimensions(bytes.readUInt16LE(start + 6) & 16383, bytes.readUInt16LE(start + 8) & 16383); found = true;
      } else if (type === "VP8L" && size >= 5 && bytes[start] === 47) {
        const bits = bytes.readUInt32LE(start + 1); dimensions((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1); found = true;
      } else if (type === "VP8X" && size === 10) {
        dimensions(bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1);
        // Animated WebP is intentionally rejected; GIF covers animated stickers.
        if (bytes[start] & 2) reject("动画请使用 GIF 格式");
      }
      p = start + size + (size & 1);
    }
    if (p !== n || !found) reject("WebP 图像数据缺失");
  } else reject("仅支持 PNG、JPEG、GIF、WebP 图片");
}

export function safeLink(link) {
  if (!link || typeof link.url !== "string" || link.url.length > 2048 || /[\u0000- \u007f]/.test(link.url)) reject("链接格式不正确", 400, "INVALID_LINK");
  let url;
  try { url = new URL(link.url); } catch { reject("链接格式不正确", 400, "INVALID_LINK"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) reject("只支持 http/https 链接", 400, "INVALID_LINK");
  const title = String(link.title || url.hostname).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || url.hostname;
  return { url: url.href, title };
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
