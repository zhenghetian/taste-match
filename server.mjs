import http from "node:http";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CONTENT_LIBRARY, CONTENT_BY_ID, QUESTION_BANK } from "./content-library.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(ROOT, "data");
const PORT = Number(process.env.PORT || 4173);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");
const DEV_OTP = process.env.DEV_OTP_CODE || "246810";
const BETA_TEST_CODE = String(process.env.BETA_TEST_CODE || "").trim();
const MASTER_INVITE = process.env.MASTER_INVITE_CODE || "ANHAO2026";
const ADMIN_KEY = process.env.ADMIN_KEY || (IS_PRODUCTION ? "" : "anhao-admin");
const DEMO_MATCHING_ENABLED = process.env.DEMO_MATCHING_ENABLED === "true" || !IS_PRODUCTION;
const SESSION_DAYS = 30;
const clients = new Map();
const analyticsWindows = new Map();

if (BETA_TEST_CODE && !/^\d{6}$/.test(BETA_TEST_CODE)) {
  throw new Error("BETA_TEST_CODE must be exactly 6 digits");
}

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, "anhao.db"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");

function now() { return new Date().toISOString(); }
function addMinutes(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString(); }
function addDays(days) { return new Date(Date.now() + days * 86_400_000).toISOString(); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function token(bytes = 24) { return randomBytes(bytes).toString("base64url"); }
function id(prefix) { return `${prefix}_${token(10)}`; }
function inviteCode() { return `AH${randomBytes(4).toString("hex").toUpperCase()}`; }

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE,
    wechat_openid TEXT UNIQUE,
    nickname TEXT NOT NULL DEFAULT '新朋友',
    city TEXT NOT NULL DEFAULT '上海',
    bio TEXT NOT NULL DEFAULT '',
    birth_year INTEGER,
    gender TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '我',
    profile_completed INTEGER NOT NULL DEFAULT 0,
    invited_by TEXT REFERENCES users(id),
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    owner_user_id TEXT REFERENCES users(id),
    max_uses INTEGER NOT NULL DEFAULT 5,
    used_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS otp_codes (
    phone TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    invite_code TEXT,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    creator TEXT NOT NULL,
    title TEXT NOT NULL,
    cover TEXT NOT NULL,
    reaction TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS echoes (
    id TEXT PRIMARY KEY,
    user_a TEXT NOT NULL REFERENCES users(id),
    user_b TEXT NOT NULL REFERENCES users(id),
    signal_a TEXT NOT NULL REFERENCES signals(id),
    signal_b TEXT NOT NULL REFERENCES signals(id),
    content_id TEXT NOT NULL,
    question TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS echo_answers (
    echo_id TEXT NOT NULL REFERENCES echoes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (echo_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    echo_id TEXT NOT NULL REFERENCES echoes(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    read_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    echo_id TEXT REFERENCES echoes(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );
  CREATE TABLE IF NOT EXISTS moderation_records (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    surface TEXT NOT NULL,
    reference_id TEXT,
    content TEXT NOT NULL,
    decision TEXT NOT NULL,
    reasons TEXT NOT NULL DEFAULT '[]',
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    event_name TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}',
    session_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_signals_content ON signals(content_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_echoes_users ON echoes(user_a, user_b, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_echo ON messages(echo_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id, blocker_id);
  CREATE INDEX IF NOT EXISTS idx_moderation_decision ON moderation_records(decision, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics_events(event_name, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id, created_at DESC);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("signals", "source_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("signals", "source_type", "TEXT NOT NULL DEFAULT 'curated'");

function seed() {
  db.prepare(`INSERT OR IGNORE INTO invites(code, max_uses, used_count, active, created_at) VALUES(?, 100, 0, 1, ?)`).run(MASTER_INVITE, now());
  const demoUsers = {
    momo:["usr_demo_momo","13900000000","默默","上海","喜欢慢慢走路，也愿意认真回答没有标准答案的问题。",2001,"女","默"],
    mina:["usr_demo_mina","13900000001","Mina","杭州","关系访谈、书和认真吃晚饭。比起秒回，更在意有没有认真回。",2000,"女","M"],
    ayuan:["usr_demo_ayuan","13900000002","阿原","上海","球场、训练细节和周末随便走走。",1999,"男","原"],
    linjian:["usr_demo_linjian","13900000003","林间","北京","对城市、技术和人的选择都保持一点好奇。",1998,"不公开","林"]
  };
  const insertUser = db.prepare(`INSERT OR IGNORE INTO users(id,phone,nickname,city,bio,birth_year,gender,avatar,profile_completed,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,1,?,?)`);
  for (const user of Object.values(demoUsers)) insertUser.run(...user,now(),now());
  db.prepare(`INSERT OR IGNORE INTO invites(code, owner_user_id, max_uses, used_count, active, created_at) VALUES('MOMO2026', ?, 20, 0, 1, ?)`).run(demoUsers.momo[0], now());
  const insert = db.prepare(`INSERT OR IGNORE INTO signals(id,user_id,content_id,creator,title,cover,reaction,created_at) VALUES(?,?,?,?,?,?,?,?)`);
  for (const item of CONTENT_LIBRARY) {
    const demoId = demoUsers[item.demoUser]?.[0] || demoUsers.momo[0];
    insert.run(`sig_demo_${item.id}`, demoId, item.id, item.creator, item.title, item.cover, item.demoReaction, now());
  }
}
seed();

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), ...headers });
  res.end(body);
}
function fail(res, status, code, message) { json(res, status, { error: { code, message } }); }
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("请求内容过大"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON 格式不正确"), { status: 400 }); }
}
function bearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}
function sessionUser(rawToken) {
  if (!rawToken) return null;
  return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(hash(rawToken), now()) || null;
}
function requireUser(req, res, url) {
  const raw = bearer(req) || url.searchParams.get("token");
  const user = sessionUser(raw);
  if (!user) fail(res, 401, "AUTH_REQUIRED", "请先登录");
  return user;
}
function publicUser(user) {
  return {
    id: user.id, phone: user.phone ? `${user.phone.slice(0,3)}****${user.phone.slice(-4)}` : null,
    nickname: user.nickname, city: user.city, bio: user.bio, birthYear: user.birth_year,
    gender: user.gender, avatar: user.avatar, profileCompleted: Boolean(user.profile_completed)
  };
}
function issueSession(userId) {
  const raw = token(32);
  db.prepare(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`).run(hash(raw), userId, addDays(SESSION_DAYS), now());
  return raw;
}
function validInvite(code) {
  if (!code) return null;
  return db.prepare(`SELECT * FROM invites WHERE code=? AND active=1 AND used_count<max_uses`).get(code.trim().toUpperCase()) || null;
}

function track(userId, eventName, properties = {}, sessionId = null) {
  const safeName = String(eventName || "").trim().slice(0,50);
  if (!safeName) return;
  db.prepare(`INSERT INTO analytics_events(id,user_id,event_name,properties,session_id,created_at) VALUES(?,?,?,?,?,?)`)
    .run(id("evt"), userId || null, safeName, JSON.stringify(properties || {}).slice(0,4000), sessionId ? String(sessionId).slice(0,80) : null, now());
}

function analyticsAllowed(userId) {
  const current = Date.now();
  const window = analyticsWindows.get(userId);
  if (!window || current-window.startedAt>=60_000) { analyticsWindows.set(userId,{startedAt:current,count:1}); return true; }
  if (window.count>=120) return false;
  window.count+=1;
  return true;
}

function blockedBetween(userA, userB) {
  return Boolean(db.prepare(`SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1`).get(userA,userB,userB,userA));
}

const BLOCKED_CONTENT = [
  { pattern:/未成年.{0,8}(约炮|性交易|裸照)|儿童色情/i, reason:"未成年人性内容" },
  { pattern:/裸聊|出售裸照|约炮|毒品交易|买卖毒品/i, reason:"色情或违禁交易" },
  { pattern:/杀了你|弄死你|砍死你|人肉你/i, reason:"暴力威胁" }
];
const REVIEW_CONTENT = [
  { pattern:/\b1[3-9]\d{9}\b|加.{0,3}(微信|vx|v信)|微信号/i, reason:"站外联系方式" },
  { pattern:/刷单|博彩|赌博|返利群|先转账|代充返现/i, reason:"疑似诈骗或赌博推广" },
  { pattern:/裸照|成人视频|性服务/i, reason:"疑似色情内容" }
];

function builtinModeration(text) {
  for (const rule of BLOCKED_CONTENT) if (rule.pattern.test(text)) return { decision:"block", reasons:[rule.reason] };
  for (const rule of REVIEW_CONTENT) if (rule.pattern.test(text)) return { decision:"review", reasons:[rule.reason] };
  return { decision:"allow", reasons:[] };
}

async function moderateText({ userId, surface, referenceId = null, text }) {
  const content = String(text || "").trim();
  let result = builtinModeration(content);
  let provider = "builtin";
  if (process.env.MODERATION_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.MODERATION_WEBHOOK_URL, {
        method:"POST",
        headers:{"content-type":"application/json"},
        signal:AbortSignal.timeout(3000),
        body:JSON.stringify({ userId, surface, text:content })
      });
      const payload = await response.json();
      if (response.ok && ["allow","review","block"].includes(payload.decision)) {
        result = { decision:payload.decision, reasons:Array.isArray(payload.reasons) ? payload.reasons.slice(0,5) : [] };
        provider = "webhook";
      }
    } catch (error) {
      console.warn("moderation webhook failed, using builtin rules", error.message);
    }
  }
  db.prepare(`INSERT INTO moderation_records(id,user_id,surface,reference_id,content,decision,reasons,provider,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(id("mod"), userId || null, surface, referenceId, content.slice(0,1000), result.decision, JSON.stringify(result.reasons), provider, now());
  if (result.decision !== "allow") {
    const error = new Error(result.decision === "review" ? "这段内容需要审核，请换一种表达" : "这段内容不符合社区安全规则");
    error.status = 422;
    error.code = result.decision === "review" ? "CONTENT_UNDER_REVIEW" : "CONTENT_BLOCKED";
    throw error;
  }
  return result;
}

function requireAdmin(req, res) {
  if (!ADMIN_KEY) { fail(res,503,"ADMIN_NOT_CONFIGURED","请先配置管理密钥"); return false; }
  const supplied = req.headers["x-admin-key"] || "";
  if (supplied !== ADMIN_KEY) { fail(res,401,"ADMIN_AUTH_REQUIRED","管理密钥不正确"); return false; }
  return true;
}

function emit(userId, type, payload) {
  const entries = clients.get(userId);
  if (!entries) return;
  const packet = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of entries) res.write(packet);
}
function notify(userId, type, title, body, data = {}) {
  const item = { id: id("ntf"), userId, type, title, body, data, createdAt: now() };
  db.prepare(`INSERT INTO notifications(id,user_id,type,title,body,data,created_at) VALUES(?,?,?,?,?,?,?)`).run(item.id, userId, type, title, body, JSON.stringify(data), item.createdAt);
  emit(userId, "notification", item);
  return item;
}

function echoRow(row, viewerId) {
  const viewerIsA = row.user_a === viewerId;
  const otherId = viewerIsA ? row.user_b : row.user_a;
  const other = db.prepare(`SELECT * FROM users WHERE id=?`).get(otherId);
  const ownSignal = db.prepare(`SELECT * FROM signals WHERE id=?`).get(viewerIsA ? row.signal_a : row.signal_b);
  const otherSignal = db.prepare(`SELECT * FROM signals WHERE id=?`).get(viewerIsA ? row.signal_b : row.signal_a);
  const answers = db.prepare(`SELECT user_id,answer,created_at FROM echo_answers WHERE echo_id=?`).all(row.id);
  const ownAnswer = answers.find((answer) => answer.user_id === viewerId);
  const otherAnswer = answers.find((answer) => answer.user_id === otherId);
  const revealed = Boolean(ownAnswer && otherAnswer);
  const messageCount = db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE echo_id=?`).get(row.id).count;
  return {
    id: row.id,
    createdAt: row.created_at,
    question: row.question,
    content: {
      id: ownSignal.content_id,
      creator: ownSignal.creator,
      title: ownSignal.title,
      cover: ownSignal.cover,
      sourceUrl: ownSignal.source_url || "",
      sourceType: ownSignal.source_type || "curated"
    },
    yourReaction: ownSignal.reaction,
    otherReaction: otherSignal.reaction,
    answered: Boolean(ownAnswer),
    otherAnswered: Boolean(otherAnswer),
    revealed,
    yourAnswer: ownAnswer?.answer || null,
    otherAnswer: revealed ? otherAnswer.answer : null,
    other: revealed ? publicUser(other) : { avatar: "?", nickname: "另一个人", city: null },
    messageCount
  };
}

function createEchoFor(signal) {
  const candidate = db.prepare(`
    SELECT s.* FROM signals s
    WHERE s.content_id=? AND s.user_id<>?
      AND (?=1 OR s.user_id NOT IN (SELECT id FROM users WHERE is_demo=1))
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id=? AND b.blocked_id=s.user_id)
           OR (b.blocker_id=s.user_id AND b.blocked_id=?)
      )
      AND NOT EXISTS (
        SELECT 1 FROM echoes e
        WHERE (e.signal_a=s.id AND e.signal_b=?) OR (e.signal_a=? AND e.signal_b=s.id)
      )
    ORDER BY s.created_at DESC LIMIT 1
  `).get(signal.content_id, signal.user_id, DEMO_MATCHING_ENABLED ? 1 : 0, signal.user_id, signal.user_id, signal.id, signal.id);
  if (!candidate) return null;
  const echoId = id("ech");
  const questionItem = QUESTION_BANK[Math.abs(signal.content_id.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0)) % QUESTION_BANK.length];
  const question = questionItem.question;
  db.prepare(`INSERT INTO echoes(id,user_a,user_b,signal_a,signal_b,content_id,question,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(echoId, signal.user_id, candidate.user_id, signal.id, candidate.id, signal.content_id, question, now());
  const candidateUser = db.prepare(`SELECT * FROM users WHERE id=?`).get(candidate.user_id);
  if (candidateUser?.is_demo) {
    const demoAnswer = questionItem.demoAnswer;
    db.prepare(`INSERT OR IGNORE INTO echo_answers(echo_id,user_id,answer,created_at) VALUES(?,?,?,?)`).run(echoId, candidate.user_id, demoAnswer, now());
  }
  notify(signal.user_id, "echo", "有人接住了你的暗号", "Ta 也在同一条内容前停了下来。", { echoId });
  notify(candidate.user_id, "echo", "有人接住了你的暗号", "Ta 也在同一条内容前停了下来。", { echoId });
  track(signal.user_id,"echo_created",{ echoId, contentId:signal.content_id });
  track(candidate.user_id,"echo_created",{ echoId, contentId:signal.content_id });
  return db.prepare(`SELECT * FROM echoes WHERE id=?`).get(echoId);
}

function normalizeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|spm$|share_|timestamp$|source$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function sharedContentId(sourceUrl) {
  return `shared_${hash(sourceUrl).slice(0, 20)}`;
}

async function api(req, res, url) {
  const method = req.method || "GET";
  const path = url.pathname;

  if (method === "GET" && path === "/api/health") return json(res, 200, { ok: true, time: now() });
  if (method === "GET" && path === "/api/auth/providers") return json(res, 200, {
    phone: true,
    wechat: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET && process.env.PUBLIC_URL),
    devMode: !IS_PRODUCTION,
    betaTestMode: Boolean(BETA_TEST_CODE)
  });

  if (method === "GET" && path === "/api/admin/analytics") {
    if (!requireAdmin(req,res)) return;
    const days = Math.min(90,Math.max(1,Number(url.searchParams.get("days")) || 7));
    const since = new Date(Date.now() - (days-1) * 86_400_000).toISOString().slice(0,10);
    const value = (sql,...params) => db.prepare(sql).get(...params).value;
    const totals = {
      users:value(`SELECT COUNT(*) AS value FROM users WHERE is_demo=0`),
      newUsers:value(`SELECT COUNT(*) AS value FROM users WHERE is_demo=0 AND date(created_at)>=date(?)`,since),
      profiles:value(`SELECT COUNT(*) AS value FROM users WHERE is_demo=0 AND profile_completed=1`),
      signalUsers:value(`SELECT COUNT(DISTINCT user_id) AS value FROM signals WHERE user_id NOT IN (SELECT id FROM users WHERE is_demo=1)`),
      signals:value(`SELECT COUNT(*) AS value FROM signals WHERE user_id NOT IN (SELECT id FROM users WHERE is_demo=1)`),
      echoUsers:value(`SELECT COUNT(DISTINCT user_id) AS value FROM (SELECT user_a AS user_id FROM echoes UNION ALL SELECT user_b FROM echoes) WHERE user_id NOT IN (SELECT id FROM users WHERE is_demo=1)`),
      echoes:value(`SELECT COUNT(*) AS value FROM echoes`),
      answeredUsers:value(`SELECT COUNT(DISTINCT user_id) AS value FROM echo_answers WHERE user_id NOT IN (SELECT id FROM users WHERE is_demo=1)`),
      revealedEchoes:value(`SELECT COUNT(*) AS value FROM echoes e WHERE (SELECT COUNT(*) FROM echo_answers a WHERE a.echo_id=e.id)>=2`),
      chatters:value(`SELECT COUNT(DISTINCT sender_id) AS value FROM messages WHERE sender_id NOT IN (SELECT id FROM users WHERE is_demo=1)`),
      messages:value(`SELECT COUNT(*) AS value FROM messages`),
      pendingReports:value(`SELECT COUNT(*) AS value FROM reports WHERE status='pending'`),
      activeBlocks:value(`SELECT COUNT(*) AS value FROM blocks`),
      moderatedContent:value(`SELECT COUNT(*) AS value FROM moderation_records WHERE decision<>'allow'`)
    };
    const daily = db.prepare(`SELECT date(created_at) AS date,event_name AS eventName,COUNT(*) AS count FROM analytics_events WHERE date(created_at)>=date(?) GROUP BY date(created_at),event_name ORDER BY date(created_at)`).all(since);
    const events = db.prepare(`SELECT event_name AS eventName,COUNT(*) AS count FROM analytics_events WHERE date(created_at)>=date(?) GROUP BY event_name ORDER BY count DESC`).all(since);
    const reports = db.prepare(`SELECT r.id,r.reason,r.detail,r.status,r.created_at AS createdAt,u.nickname AS reportedName FROM reports r JOIN users u ON u.id=r.reported_user_id ORDER BY r.created_at DESC LIMIT 20`).all();
    return json(res,200,{ days,totals,daily,events,reports });
  }

  const reportStatusMatch = path.match(/^\/api\/admin\/reports\/([^/]+)\/status$/);
  if (method === "POST" && reportStatusMatch) {
    if (!requireAdmin(req,res)) return;
    const { status } = await readJson(req);
    if (!["resolved","dismissed","pending"].includes(status)) return fail(res,400,"INVALID_REPORT_STATUS","举报状态不正确");
    const result = db.prepare(`UPDATE reports SET status=? WHERE id=?`).run(status,reportStatusMatch[1]);
    if (!result.changes) return fail(res,404,"REPORT_NOT_FOUND","没有找到这条举报");
    return json(res,200,{ok:true});
  }

  if (method === "POST" && path === "/api/auth/send-code") {
    const { phone } = await readJson(req);
    if (!/^1\d{10}$/.test(phone || "")) return fail(res, 400, "INVALID_PHONE", "请输入正确的 11 位手机号");
    if (IS_PRODUCTION && !BETA_TEST_CODE && !process.env.SMS_WEBHOOK_URL) {
      return fail(res, 503, "SMS_NOT_CONFIGURED", "正式短信服务尚未配置");
    }
    const delivery = BETA_TEST_CODE ? "beta" : (IS_PRODUCTION ? "sms" : "development");
    const code = BETA_TEST_CODE || (IS_PRODUCTION ? String(randomInt(100000, 999999)) : DEV_OTP);
    db.prepare(`INSERT INTO otp_codes(phone,code_hash,expires_at,attempts,created_at) VALUES(?,?,?,0,?)
      ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,created_at=excluded.created_at`)
      .run(phone, hash(code), addMinutes(10), now());
    if (delivery === "sms") {
      const response = await fetch(process.env.SMS_WEBHOOK_URL, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ phone, code }) });
      if (!response.ok) return fail(res, 502, "SMS_FAILED", "验证码发送失败");
    }
    return json(res, 200, { sent: true, expiresIn: 600, delivery, ...(delivery === "development" ? { devCode: code } : {}) });
  }

  if (method === "POST" && path === "/api/auth/verify") {
    const { phone, code, inviteCode: suppliedInvite } = await readJson(req);
    const otp = db.prepare(`SELECT * FROM otp_codes WHERE phone=?`).get(phone);
    if (!otp || otp.expires_at <= now()) return fail(res, 400, "INVALID_CODE", "验证码错误或已过期");
    if (otp.attempts >= 5) return fail(res, 429, "TOO_MANY_ATTEMPTS", "尝试次数过多，请重新获取验证码");
    if (otp.code_hash !== hash(String(code || ""))) {
      db.prepare(`UPDATE otp_codes SET attempts=attempts+1 WHERE phone=?`).run(phone);
      return fail(res, 400, "INVALID_CODE", "验证码错误或已过期");
    }
    let user = db.prepare(`SELECT * FROM users WHERE phone=?`).get(phone);
    const isNewUser = !user;
    if (!user) {
      const invite = validInvite(suppliedInvite);
      if (!invite) return fail(res, 400, "INVALID_INVITE", "邀请码无效或已达到使用上限");
      const userId = id("usr");
      const timestamp = now();
      db.prepare(`INSERT INTO users(id,phone,nickname,city,avatar,invited_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
        .run(userId, phone, "新朋友", "上海", "我", invite.owner_user_id || null, timestamp, timestamp);
      db.prepare(`UPDATE invites SET used_count=used_count+1 WHERE code=?`).run(invite.code);
      db.prepare(`INSERT INTO invites(code,owner_user_id,max_uses,used_count,active,created_at) VALUES(?,?,5,0,1,?)`).run(inviteCode(), userId, timestamp);
      user = db.prepare(`SELECT * FROM users WHERE id=?`).get(userId);
    }
    db.prepare(`DELETE FROM otp_codes WHERE phone=?`).run(phone);
    track(user.id,isNewUser ? "registration_completed" : "login_completed",{provider:"phone"});
    return json(res, 200, { token: issueSession(user.id), user: publicUser(user) });
  }

  if (method === "GET" && path === "/api/auth/wechat/start") {
    if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET || !process.env.PUBLIC_URL) {
      return fail(res, 503, "WECHAT_NOT_CONFIGURED", "微信网页授权需要配置公众号 AppID、AppSecret 和公网回调地址");
    }
    const state = token(18);
    const invite = url.searchParams.get("invite") || "";
    db.prepare(`INSERT INTO oauth_states(state,invite_code,expires_at) VALUES(?,?,?)`).run(state, invite, addMinutes(10));
    const callback = encodeURIComponent(`${process.env.PUBLIC_URL}/api/auth/wechat/callback`);
    const target = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(process.env.WECHAT_APP_ID)}&redirect_uri=${callback}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
    res.writeHead(302, { location: target }); return res.end();
  }

  if (method === "GET" && path === "/api/auth/wechat/callback") {
    const stateRow = db.prepare(`SELECT * FROM oauth_states WHERE state=? AND expires_at>?`).get(url.searchParams.get("state"), now());
    if (!stateRow) return fail(res, 400, "INVALID_STATE", "微信登录状态已过期");
    const code = url.searchParams.get("code");
    const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
    tokenUrl.search = new URLSearchParams({ appid:process.env.WECHAT_APP_ID, secret:process.env.WECHAT_APP_SECRET, code, grant_type:"authorization_code" });
    const access = await fetch(tokenUrl).then((r) => r.json());
    if (!access.openid) return fail(res, 502, "WECHAT_AUTH_FAILED", "微信授权失败");
    let user = db.prepare(`SELECT * FROM users WHERE wechat_openid=?`).get(access.openid);
    if (!user) {
      const invite = validInvite(stateRow.invite_code);
      if (!invite) return fail(res, 400, "INVALID_INVITE", "首次微信登录需要有效邀请码");
      const infoUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
      infoUrl.search = new URLSearchParams({ access_token:access.access_token, openid:access.openid, lang:"zh_CN" });
      const info = await fetch(infoUrl).then((r) => r.json());
      const userId = id("usr");
      await moderateText({userId:null,surface:"wechat_profile",referenceId:userId,text:info.nickname || "微信用户"});
      db.prepare(`INSERT INTO users(id,wechat_openid,nickname,city,avatar,invited_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
        .run(userId, access.openid, info.nickname || "微信用户", info.city || "上海", (info.nickname || "我").slice(0,1), invite.owner_user_id || null, now(), now());
      db.prepare(`UPDATE invites SET used_count=used_count+1 WHERE code=?`).run(invite.code);
      db.prepare(`INSERT INTO invites(code,owner_user_id,max_uses,created_at) VALUES(?,?,5,?)`).run(inviteCode(), userId, now());
      user = db.prepare(`SELECT * FROM users WHERE id=?`).get(userId);
    }
    db.prepare(`DELETE FROM oauth_states WHERE state=?`).run(stateRow.state);
    const raw = issueSession(user.id);
    track(user.id,"login_completed",{provider:"wechat"});
    res.writeHead(302, { location: `/?wechat_session=${encodeURIComponent(raw)}` }); return res.end();
  }

  if (method === "GET" && path === "/api/events") {
    const user = requireUser(req, res, url); if (!user) return;
    res.writeHead(200, { "content-type":"text/event-stream", "cache-control":"no-cache", connection:"keep-alive", "x-accel-buffering":"no" });
    res.write(`event: ready\ndata: {"ok":true}\n\n`);
    const set = clients.get(user.id) || new Set(); set.add(res); clients.set(user.id, set);
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20_000);
    req.on("close", () => { clearInterval(heartbeat); set.delete(res); if (!set.size) clients.delete(user.id); });
    return;
  }

  const user = requireUser(req, res, url); if (!user) return;

  if (method === "POST" && path === "/api/auth/logout") {
    db.prepare(`DELETE FROM sessions WHERE token_hash=?`).run(hash(bearer(req))); return json(res, 200, { ok:true });
  }
  if (method === "POST" && path === "/api/analytics/track") {
    const body = await readJson(req);
    const allowedEvents = ["app_open","tab_view","video_impression","video_play","reaction_sheet_open","chat_open","notification_prompt","signal_composer_open","signal_submitted","echo_open","share_import_open"];
    if (!allowedEvents.includes(body.eventName)) return fail(res,400,"INVALID_EVENT","埋点事件不在允许列表中");
    if (!analyticsAllowed(user.id)) return fail(res,429,"TOO_MANY_EVENTS","埋点请求过于频繁");
    const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
    track(user.id,body.eventName,properties,body.sessionId);
    return json(res,202,{accepted:true});
  }
  if (method === "GET" && path === "/api/me") {
    const invite = db.prepare(`SELECT code,max_uses,used_count FROM invites WHERE owner_user_id=? AND active=1 ORDER BY created_at DESC LIMIT 1`).get(user.id);
    return json(res, 200, { user:publicUser(user), invite });
  }
  if (method === "PATCH" && path === "/api/me") {
    const body = await readJson(req);
    const nickname = String(body.nickname || "").trim().slice(0,20);
    const city = String(body.city || "").trim().slice(0,20);
    const bio = String(body.bio || "").trim().slice(0,120);
    const birthYear = Number(body.birthYear) || null;
    const gender = ["男","女","其他","不公开"].includes(body.gender) ? body.gender : "";
    if (nickname.length < 2 || !city) return fail(res, 400, "INVALID_PROFILE", "请填写昵称和城市");
    await moderateText({userId:user.id,surface:"profile",referenceId:user.id,text:`${nickname}\n${bio}`});
    db.prepare(`UPDATE users SET nickname=?,city=?,bio=?,birth_year=?,gender=?,avatar=?,profile_completed=1,updated_at=? WHERE id=?`)
      .run(nickname, city, bio, birthYear, gender, nickname.slice(0,1), now(), user.id);
    track(user.id,"profile_completed",{city,editing:Boolean(user.profile_completed)});
    return json(res, 200, { user:publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(user.id)) });
  }

  if (method === "POST" && path === "/api/signals") {
    const body = await readJson(req);
    const reaction = String(body.reaction || "").trim().slice(0, 160);
    if (reaction.length < 2) return fail(res, 400, "INVALID_SIGNAL", "请留下一句真实的感受");
    await moderateText({userId:user.id,surface:"signal",text:reaction});

    let content = body.contentId ? CONTENT_BY_ID.get(String(body.contentId)) : null;
    let sourceUrl = "";
    let sourceType = "curated";
    if (!content) {
      sourceUrl = normalizeExternalUrl(body.sourceUrl);
      if (!sourceUrl) return fail(res,400,"INVALID_SOURCE_URL","请粘贴一个可以打开的内容链接");
      const title = String(body.title || "").trim().slice(0, 80);
      if (title.length < 2) return fail(res,400,"TITLE_REQUIRED","给这条内容写一个简短标题");
      await moderateText({userId:user.id,surface:"shared_content",text:title});
      sourceType = "shared";
      content = {
        id: sharedContentId(sourceUrl),
        creator: "你带来的内容",
        title,
        cover: "",
        url: sourceUrl
      };
    } else {
      sourceUrl = content.url || "";
    }
    const existing = db.prepare(`SELECT * FROM signals WHERE user_id=? AND content_id=? ORDER BY created_at DESC LIMIT 1`).get(user.id,content.id);
    if (existing) {
      db.prepare(`UPDATE signals SET reaction=?,source_url=?,source_type=?,created_at=? WHERE id=?`).run(reaction,sourceUrl,sourceType,now(),existing.id);
      const echo = db.prepare(`SELECT * FROM echoes WHERE signal_a=? OR signal_b=? ORDER BY created_at DESC LIMIT 1`).get(existing.id,existing.id);
      const count = db.prepare(`SELECT COUNT(DISTINCT content_id) AS count FROM signals WHERE user_id=?`).get(user.id).count;
      track(user.id,"signal_created",{contentId:content.id,sourceType,updated:true,echoCreated:Boolean(echo)});
      return json(res,200,{signal:{id:existing.id,reaction,sourceUrl,sourceType,createdAt:now()},traceCount:count,echo:echo ? echoRow(echo,user.id) : null,updated:true});
    }
    const signal = { id:id("sig"), user_id:user.id, content_id:content.id, creator:content.creator, title:content.title, cover:content.cover, reaction, source_url:sourceUrl, source_type:sourceType, created_at:now() };
    db.prepare(`INSERT INTO signals(id,user_id,content_id,creator,title,cover,reaction,source_url,source_type,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(signal.id, signal.user_id, signal.content_id, signal.creator, signal.title, signal.cover, signal.reaction, signal.source_url, signal.source_type, signal.created_at);
    const echo = createEchoFor(signal);
    const count = db.prepare(`SELECT COUNT(DISTINCT content_id) AS count FROM signals WHERE user_id=?`).get(user.id).count;
    track(user.id,"signal_created",{contentId:signal.content_id,sourceType,echoCreated:Boolean(echo)});
    return json(res, 201, { signal:{ id:signal.id, reaction:signal.reaction, sourceUrl, sourceType, createdAt:signal.created_at }, traceCount:count, echo:echo ? echoRow(echo,user.id) : null });
  }
  if (method === "GET" && path === "/api/signals") {
    const rows = db.prepare(`SELECT id,content_id AS contentId,creator,title,cover,reaction,source_url AS sourceUrl,source_type AS sourceType,created_at AS createdAt FROM signals WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).all(user.id);
    return json(res, 200, { signals:rows });
  }

  if (method === "GET" && path === "/api/echoes") {
    const rows = db.prepare(`SELECT * FROM echoes e WHERE (user_a=? OR user_b=?) AND NOT EXISTS (
      SELECT 1 FROM blocks b WHERE (b.blocker_id=e.user_a AND b.blocked_id=e.user_b) OR (b.blocker_id=e.user_b AND b.blocked_id=e.user_a)
    ) ORDER BY created_at DESC`).all(user.id,user.id);
    return json(res, 200, { echoes:rows.map((row) => echoRow(row,user.id)) });
  }
  const echoMatch = path.match(/^\/api\/echoes\/([^/]+)$/);
  if (method === "GET" && echoMatch) {
    const row = db.prepare(`SELECT * FROM echoes WHERE id=? AND (user_a=? OR user_b=?)`).get(echoMatch[1],user.id,user.id);
    if (!row) return fail(res,404,"ECHO_NOT_FOUND","没有找到这条回声");
    const otherId = row.user_a===user.id ? row.user_b : row.user_a;
    if (blockedBetween(user.id,otherId)) return fail(res,403,"USER_BLOCKED","这段关系已被拉黑");
    return json(res,200,{ echo:echoRow(row,user.id) });
  }
  const answerMatch = path.match(/^\/api\/echoes\/([^/]+)\/answer$/);
  if (method === "POST" && answerMatch) {
    const row = db.prepare(`SELECT * FROM echoes WHERE id=? AND (user_a=? OR user_b=?)`).get(answerMatch[1],user.id,user.id);
    if (!row) return fail(res,404,"ECHO_NOT_FOUND","没有找到这条回声");
    const { answer } = await readJson(req);
    if (!String(answer || "").trim()) return fail(res,400,"ANSWER_REQUIRED","请选择或填写一个答案");
    const otherId = row.user_a===user.id ? row.user_b : row.user_a;
    if (blockedBetween(user.id,otherId)) return fail(res,403,"USER_BLOCKED","这段关系已被拉黑");
    await moderateText({userId:user.id,surface:"echo_answer",referenceId:row.id,text:answer});
    db.prepare(`INSERT INTO echo_answers(echo_id,user_id,answer,created_at) VALUES(?,?,?,?) ON CONFLICT(echo_id,user_id) DO UPDATE SET answer=excluded.answer,created_at=excluded.created_at`)
      .run(row.id,user.id,String(answer).trim().slice(0,200),now());
    notify(otherId,"answer","对方回答了同一个问题","你们的这次相遇向前走了一步。",{ echoId:row.id });
    const updated = echoRow(row,user.id);
    if (updated.revealed) notify(user.id,"reveal","这句暗号被接住了","现在可以看见对方，并开始对话。",{ echoId:row.id });
    track(user.id,"answer_submitted",{echoId:row.id,revealed:updated.revealed});
    if (updated.revealed) track(user.id,"echo_revealed",{echoId:row.id});
    return json(res,200,{ echo:updated });
  }

  const messagesMatch = path.match(/^\/api\/echoes\/([^/]+)\/messages$/);
  if (messagesMatch) {
    const row = db.prepare(`SELECT * FROM echoes WHERE id=? AND (user_a=? OR user_b=?)`).get(messagesMatch[1],user.id,user.id);
    if (!row) return fail(res,404,"ECHO_NOT_FOUND","没有找到这条回声");
    const otherId = row.user_a===user.id ? row.user_b : row.user_a;
    if (blockedBetween(user.id,otherId)) return fail(res,403,"USER_BLOCKED","这段关系已被拉黑");
    const state = echoRow(row,user.id);
    if (!state.revealed) return fail(res,403,"ECHO_LOCKED","双方回答后才能开始对话");
    if (method === "GET") {
      const rows = db.prepare(`SELECT m.id,m.body,m.created_at AS createdAt,m.sender_id AS senderId,u.nickname AS senderName FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.echo_id=? ORDER BY m.created_at`).all(row.id);
      return json(res,200,{ messages:rows });
    }
    if (method === "POST") {
      const { body } = await readJson(req);
      const text = String(body || "").trim().slice(0,500);
      if (!text) return fail(res,400,"MESSAGE_REQUIRED","消息不能为空");
      await moderateText({userId:user.id,surface:"message",referenceId:row.id,text});
      const message = { id:id("msg"), echoId:row.id, senderId:user.id, senderName:user.nickname, body:text, createdAt:now() };
      db.prepare(`INSERT INTO messages(id,echo_id,sender_id,body,created_at) VALUES(?,?,?,?,?)`).run(message.id,row.id,user.id,text,message.createdAt);
      emit(user.id,"message",message); emit(otherId,"message",message);
      notify(otherId,"message",`${user.nickname} 发来一条消息`,text,{ echoId:row.id });
      track(user.id,"message_sent",{echoId:row.id});
      return json(res,201,{ message });
    }
  }

  if (method === "GET" && path === "/api/conversations") {
    const rows = db.prepare(`SELECT * FROM echoes e WHERE (user_a=? OR user_b=?) AND NOT EXISTS (
      SELECT 1 FROM blocks b WHERE (b.blocker_id=e.user_a AND b.blocked_id=e.user_b) OR (b.blocker_id=e.user_b AND b.blocked_id=e.user_a)
    ) ORDER BY created_at DESC`).all(user.id,user.id)
      .map((row) => echoRow(row,user.id)).filter((row) => row.revealed);
    return json(res,200,{ conversations:rows });
  }

  const reportMatch = path.match(/^\/api\/users\/([^/]+)\/report$/);
  if (method === "POST" && reportMatch) {
    const reportedId = reportMatch[1];
    if (reportedId === user.id) return fail(res,400,"CANNOT_REPORT_SELF","不能举报自己");
    const target = db.prepare(`SELECT * FROM users WHERE id=?`).get(reportedId);
    if (!target) return fail(res,404,"USER_NOT_FOUND","没有找到这个用户");
    const body = await readJson(req);
    const reasons = ["骚扰或辱骂","色情或不适内容","诈骗或广告","冒充他人","其他"];
    if (!reasons.includes(body.reason)) return fail(res,400,"INVALID_REPORT_REASON","请选择举报原因");
    const relationship = db.prepare(`SELECT id FROM echoes WHERE id=? AND ((user_a=? AND user_b=?) OR (user_a=? AND user_b=?))`).get(body.echoId,user.id,reportedId,reportedId,user.id);
    if (!relationship) return fail(res,403,"REPORT_NOT_ALLOWED","只能举报与你发生过回声的人");
    const existing = db.prepare(`SELECT id,status FROM reports WHERE reporter_id=? AND reported_user_id=? AND echo_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`).get(user.id,reportedId,relationship.id);
    if (existing) return json(res,200,{report:existing});
    const reportId = id("rpt");
    db.prepare(`INSERT INTO reports(id,reporter_id,reported_user_id,echo_id,reason,detail,status,created_at) VALUES(?,?,?,?,?,?,'pending',?)`)
      .run(reportId,user.id,reportedId,relationship.id,body.reason,String(body.detail || "").trim().slice(0,300),now());
    track(user.id,"report_created",{reason:body.reason,reportedUserId:reportedId});
    return json(res,201,{report:{id:reportId,status:"pending"}});
  }

  const blockMatch = path.match(/^\/api\/users\/([^/]+)\/block$/);
  if (blockMatch && method === "POST") {
    const blockedId = blockMatch[1];
    if (blockedId === user.id) return fail(res,400,"CANNOT_BLOCK_SELF","不能拉黑自己");
    const target = db.prepare(`SELECT * FROM users WHERE id=?`).get(blockedId);
    if (!target) return fail(res,404,"USER_NOT_FOUND","没有找到这个用户");
    const relationship = db.prepare(`SELECT 1 FROM echoes WHERE (user_a=? AND user_b=?) OR (user_a=? AND user_b=?) LIMIT 1`).get(user.id,blockedId,blockedId,user.id);
    if (!relationship) return fail(res,403,"BLOCK_NOT_ALLOWED","只能拉黑与你发生过回声的人");
    db.prepare(`INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)`).run(user.id,blockedId,now());
    track(user.id,"user_blocked",{blockedUserId:blockedId});
    return json(res,201,{blocked:true});
  }
  if (blockMatch && method === "DELETE") {
    db.prepare(`DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?`).run(user.id,blockMatch[1]);
    track(user.id,"user_unblocked",{blockedUserId:blockMatch[1]});
    return json(res,200,{blocked:false});
  }
  if (method === "GET" && path === "/api/blocks") {
    const rows = db.prepare(`SELECT u.* ,b.created_at AS blocked_at FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC`).all(user.id);
    return json(res,200,{blocks:rows.map((row)=>({...publicUser(row),blockedAt:row.blocked_at}))});
  }

  if (method === "GET" && path === "/api/notifications") {
    const rows = db.prepare(`SELECT id,type,title,body,data,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).all(user.id)
      .map((row) => ({...row,data:JSON.parse(row.data)}));
    return json(res,200,{ notifications:rows });
  }
  if (method === "POST" && path === "/api/notifications/read") {
    db.prepare(`UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL`).run(now(),user.id); return json(res,200,{ok:true});
  }

  return fail(res,404,"NOT_FOUND","接口不存在");
}

const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".svg":"image/svg+xml", ".mp4":"video/mp4", ".webmanifest":"application/manifest+json" };
function staticFile(req,res,url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/signal-mvp.html" : url.pathname);
  const target = resolve(ROOT, `.${normalize(pathname)}`);
  if (!target.startsWith(resolve(ROOT)) || !existsSync(target)) return fail(res,404,"NOT_FOUND","页面不存在");
  const content = readFileSync(target);
  const headers = { "content-type":MIME[extname(target).toLowerCase()] || "application/octet-stream", "content-length":content.length, "cache-control":target.endsWith("index.html") ? "no-cache" : "public, max-age=3600" };
  if (extname(target)===".mp4") headers["accept-ranges"]="bytes";
  res.writeHead(200,headers); res.end(content);
}

export function createServer() {
  return http.createServer(async (req,res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) await api(req,res,url);
      else staticFile(req,res,url);
    } catch (error) {
      if (!error.status || error.status>=500) console.error(error);
      if (!res.headersSent) fail(res,error.status || 500,error.code || "SERVER_ERROR",error.status ? error.message : "服务器暂时出了点问题");
      else res.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT,HOST,() => console.log(`暗号闭测版已启动: http://${HOST}:${PORT}`));
}
