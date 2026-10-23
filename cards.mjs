// 暗号卡: text-only friend cards. Card text lives only in `cards`/`card_group_entries` and is
// physically deleted on delete or expiry; `card_events` never stores card text.
import { cardSafetyIssue } from "./card-safety.mjs";
import { localMatch } from "./card-play.mjs";
export { normalizeAnswer, localMatch } from "./card-play.mjs";

export const CARD_EVENTS = ["card_created", "card_copied", "card_opened", "answer_tried", "card_unlocked", "reply_started", "reply_created", "feedback_sent"];
export const CARD_SOURCES = ["x", "mifi", "friend", "xhs", "reply", "direct"];
export const UNLOCK_TYPES = ["message", "surprise", "invite"];
export const CARD_DAILY_LIMIT = 10;
export const CARD_TTL_DAYS = 30;
export const MAX_ATTEMPTS = 3;
const GROUP_ENTRY_LIMIT = 20;
const FEEDBACK_LIMIT = 20;
const REPORT_REASONS = ["insult", "sexual", "privacy", "politics", "spam", "other"];

export function cleanSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return CARD_SOURCES.includes(source) ? source : "direct";
}

export function createCardModule({ db, helpers }) {
  const { now, addDays, id, token, json, fail, readJson, requireUser, optionalUser, requireAdmin, publicBaseUrl, ensureFriendInvite, friendshipBetween, orderedPair, blockedBetween, getHarness, builtinModeration } = helpers;

  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reply_to_card_id TEXT,
      group_id TEXT,
      unlock_type TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      alt_answers TEXT NOT NULL DEFAULT '[]',
      hint TEXT NOT NULL DEFAULT '',
      extra_hint TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      invite_when TEXT NOT NULL DEFAULT '',
      invite_where TEXT NOT NULL DEFAULT '',
      penalty TEXT NOT NULL DEFAULT '',
      sender_name TEXT NOT NULL DEFAULT '',
      ai_assisted INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'direct',
      attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'created',
      opened_at TEXT, unlocked_at TEXT, failed_at TEXT, replied_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_sender ON cards(sender_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cards_expiry ON cards(expires_at);
    CREATE TABLE IF NOT EXISTS card_events (
      id TEXT PRIMARY KEY,
      card_id TEXT,
      event_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      attempt INTEGER,
      correct INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_card_events_time ON card_events(created_at, event_name);
    CREATE TABLE IF NOT EXISTS card_groups (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS card_group_entries (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES card_groups(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS card_daily_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS card_feedback (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    -- Recipient guesses. Visible only to the card's sender and that recipient; deleted with the card.
    CREATE TABLE IF NOT EXISTS card_attempts (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      guess TEXT NOT NULL,
      correct INTEGER NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_card_attempts_card ON card_attempts(card_id, created_at);
  `);
  // Migration for cards created before recipient login: add recipient_id; old cards bind on first logged-in open.
  if (!db.prepare(`PRAGMA table_info(cards)`).all().some((column) => column.name === "recipient_id")) {
    db.exec(`ALTER TABLE cards ADD COLUMN recipient_id TEXT`);
  }
  if (!db.prepare(`PRAGMA table_info(cards)`).all().some((column) => column.name === "extra_hint")) {
    db.exec(`ALTER TABLE cards ADD COLUMN extra_hint TEXT NOT NULL DEFAULT ''`);
  }
  if (!db.prepare(`PRAGMA table_info(card_attempts)`).all().some((column) => column.name === "accepted_at")) {
    db.exec(`ALTER TABLE card_attempts ADD COLUMN accepted_at TEXT`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cards_recipient ON cards(recipient_id, created_at DESC)`);

  function logEvent(cardId, eventName, source, { attempt = null, correct = null } = {}) {
    if (!CARD_EVENTS.includes(eventName)) throw new Error(`unknown card event ${eventName}`);
    db.prepare(`INSERT INTO card_events(id,card_id,event_name,source,attempt,correct,created_at) VALUES(?,?,?,?,?,?,?)`)
      .run(id("cev"), cardId, eventName, cleanSource(source), attempt, correct === null ? null : (correct ? 1 : 0), now());
  }

  function usage(userId, day) {
    return db.prepare(`SELECT count FROM card_daily_usage WHERE user_id=? AND day=?`).get(userId, day)?.count || 0;
  }

  function purgeExpired() {
    const stamp = now();
    db.prepare(`DELETE FROM cards WHERE expires_at<=?`).run(stamp);
    db.prepare(`DELETE FROM card_groups WHERE expires_at<=?`).run(stamp);
    db.prepare(`DELETE FROM card_attempts WHERE card_id NOT IN (SELECT id FROM cards)`).run();
  }

  function deleteCard(cardId) {
    db.prepare(`DELETE FROM cards WHERE id=?`).run(cardId);
    db.prepare(`DELETE FROM card_attempts WHERE card_id=?`).run(cardId);
    // Feedback detail is the recipient's own words; drop it with the card, keep report reasons.
    db.prepare(`DELETE FROM card_feedback WHERE card_id=? AND kind='feedback'`).run(cardId);
    db.prepare(`UPDATE card_feedback SET detail='' WHERE card_id=?`).run(cardId);
  }

  function safeText(value, max, label, { required = true } = {}) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (required) throw Object.assign(new Error(`请填写${label}`), { status: 400, code: "INVALID_CARD" });
      return "";
    }
    if ([...text].length > max) throw Object.assign(new Error(`${label}最多 ${max} 个字`), { status: 400, code: "INVALID_CARD" });
    const issue = cardSafetyIssue(text);
    if (issue) throw Object.assign(new Error(`${label}里有不适合的内容（${issue.reason}）。整蛊可以，别伤人、别泄露隐私哦`), { status: 422, code: "CARD_UNSAFE" });
    const builtin = builtinModeration(text);
    if (builtin.decision !== "allow") throw Object.assign(new Error(`${label}里有不适合的内容（${builtin.reasons[0]}）`), { status: 422, code: "CARD_UNSAFE" });
    return text;
  }

  function shareUrl(req, card) {
    return `${publicBaseUrl(req)}/card.html#c=${card.token}`;
  }

  const maskPhone = (phone) => phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : null;
  function accountView(userId) {
    const row = userId ? db.prepare(`SELECT id, nickname, phone FROM users WHERE id=?`).get(userId) : null;
    return row ? { id: row.id, nickname: row.nickname, phone: maskPhone(row.phone) } : null;
  }
  function attemptsFor(cardId, userId) {
    const rows = userId
      ? db.prepare(`SELECT id, user_id, guess, correct, created_at FROM card_attempts WHERE card_id=? AND user_id=? ORDER BY created_at, rowid`).all(cardId, userId)
      : db.prepare(`SELECT id, user_id, guess, correct, created_at FROM card_attempts WHERE card_id=? ORDER BY created_at, rowid`).all(cardId);
    const people = new Map();
    return rows.map((row) => {
      if (!people.has(row.user_id)) people.set(row.user_id, accountView(row.user_id));
      return { id: row.id, guess: row.guess, correct: Boolean(row.correct), createdAt: row.created_at, answeredBy: people.get(row.user_id) };
    });
  }
  function receivedView(card, req) {
    const view = publicView(card, { reveal: true });
    return { token: card.token, shareUrl: shareUrl(req, card), status: card.status, createdAt: card.created_at, ...view };
  }

  function ownerView(card, req) {
    return {
      recipient: accountView(card.recipient_id), answers: attemptsFor(card.id),
      id: card.id, token: card.token, shareUrl: shareUrl(req, card), status: card.status,
      unlockType: card.unlock_type, question: card.question, answer: card.answer, hint: card.hint,
      extraHint: card.extra_hint, senderName: card.sender_name || "一位朋友",
      content: card.content, inviteWhen: card.invite_when, inviteWhere: card.invite_where, penalty: card.penalty,
      aiAssisted: Boolean(card.ai_assisted), attempts: card.attempts, source: card.source,
      replyToCardId: card.reply_to_card_id, groupId: card.group_id,
      openedAt: card.opened_at, unlockedAt: card.unlocked_at, failedAt: card.failed_at, repliedAt: card.replied_at,
      expiresAt: card.expires_at, createdAt: card.created_at
    };
  }

  function publicView(card, { reveal = false } = {}) {
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - card.attempts);
    const unlocked = Boolean(card.unlocked_at);
    const view = {
      question: card.question, senderName: card.sender_name || "一位朋友", unlockType: card.unlock_type,
      group: Boolean(card.group_id), aiAssisted: Boolean(card.ai_assisted), hasPenalty: Boolean(card.penalty),
      attemptsLeft, maxAttempts: MAX_ATTEMPTS, unlocked, failed: !unlocked && attemptsLeft === 0,
      extraHint: card.extra_hint,
      hint: card.attempts > 0 || unlocked ? card.hint : "", isReply: Boolean(card.reply_to_card_id), expiresAt: card.expires_at
    };
    if (unlocked && reveal) Object.assign(view, { content: card.content, inviteWhen: card.invite_when, inviteWhere: card.invite_where });
    if (!unlocked && attemptsLeft === 0) view.penalty = card.penalty;
    return view;
  }

  function cardByToken(raw) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(raw)) return null;
    const card = db.prepare(`SELECT * FROM cards WHERE token=?`).get(raw);
    return card && card.expires_at > now() ? card : null;
  }

  function ensureFriendship(user, ownerId) {
    // Reuse the existing friend_invites + friendships so card replies build the friend graph.
    if (!ownerId || ownerId === user.id || blockedBetween(user.id, ownerId) || friendshipBetween(user.id, ownerId)) return;
    const invite = ensureFriendInvite(ownerId);
    const [a, b] = orderedPair(user.id, ownerId);
    db.prepare(`INSERT OR IGNORE INTO friendships(id,user_a,user_b,invited_by,invite_code,created_at) VALUES(?,?,?,?,?,?)`)
      .run(id("frn"), a, b, ownerId, invite.code, now());
    db.prepare(`UPDATE friend_invites SET used_count=used_count+1 WHERE code=?`).run(invite.code);
  }

  function funnel(days) {
    const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const rows = db.prepare(`SELECT event_name AS eventName, source, COUNT(*) AS count, COUNT(DISTINCT card_id) AS cards FROM card_events WHERE date(created_at)>=date(?) GROUP BY event_name, source`).all(since);
    const totals = Object.fromEntries(CARD_EVENTS.map((name) => [name, 0]));
    const bySource = {};
    for (const row of rows) {
      totals[row.eventName] = (totals[row.eventName] || 0) + row.count;
      bySource[row.source] ||= Object.fromEntries(CARD_EVENTS.map((name) => [name, 0]));
      bySource[row.source][row.eventName] = row.count;
    }
    const senders = db.prepare(`SELECT COUNT(DISTINCT sender_id) AS value FROM cards`).get().value;
    const activeCards = db.prepare(`SELECT status, COUNT(*) AS count FROM cards GROUP BY status`).all();
    const reports = db.prepare(`SELECT id, card_id AS cardId, kind, reason, detail, status, created_at AS createdAt FROM card_feedback ORDER BY created_at DESC LIMIT 30`).all();
    const rate = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    return {
      days, events: CARD_EVENTS, totals, bySource, senders, activeCards, reports,
      rates: {
        openRate: rate(totals.card_opened, totals.card_created),
        unlockRate: rate(totals.card_unlocked, totals.card_opened),
        replyRate: rate(totals.reply_created, totals.card_unlocked)
      }
    };
  }

  async function handle(req, res, url) {
    const method = req.method || "GET";
    const path = url.pathname;

    if (path === "/api/admin/cards/funnel" && method === "GET") {
      if (!requireAdmin(req, res)) return true;
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 14));
      json(res, 200, funnel(days)); return true;
    }
    const adminDelete = path.match(/^\/api\/admin\/cards\/([^/]+)$/);
    if (adminDelete && method === "DELETE") {
      if (!requireAdmin(req, res)) return true;
      deleteCard(adminDelete[1]);
      db.prepare(`UPDATE card_feedback SET status='resolved' WHERE card_id=?`).run(adminDelete[1]);
      json(res, 200, { ok: true }); return true;
    }

    if (!path.startsWith("/api/cards") && !path.startsWith("/api/card-groups")) return false;
    res.setHeader?.("cache-control", "no-store");
    purgeExpired();

    // ---- Public, no-login recipient endpoints ----
    const pub = path.match(/^\/api\/cards\/public\/([^/]+)(?:\/(answer|event|feedback))?$/);
    if (pub) {
      const card = cardByToken(pub[1]);
      if (!card) { fail(res, 404, "CARD_NOT_FOUND", "这张卡已经过期、被删掉了，或者链接不对"); return true; }
      const action = pub[2];
      const viewer = optionalUser(req, url);
      // Binds the card to the first logged-in non-sender who opens it. Returns an error string or null.
      const claim = () => {
        if (!viewer) return "login";
        if (viewer.id === card.sender_id) return "sender";
        if (!card.recipient_id) {
          db.prepare(`UPDATE cards SET recipient_id=? WHERE id=? AND recipient_id IS NULL`).run(viewer.id, card.id);
          card.recipient_id = db.prepare(`SELECT recipient_id FROM cards WHERE id=?`).get(card.id).recipient_id;
        }
        return card.recipient_id === viewer.id ? null : "claimed";
      };
      const claimedFail = () => fail(res, 403, "CARD_CLAIMED", "这张卡已经被别人领走啦，暗号只属于一个人");
      if (!action && method === "GET") {
        if (!viewer) {
          // Teaser only: enough to know it's a card for you, nothing that helps answer it.
          json(res, 200, { loginRequired: true, card: { teaser: true, senderName: card.sender_name || "一位朋友", isReply: Boolean(card.reply_to_card_id), group: Boolean(card.group_id), expiresAt: card.expires_at } }); return true;
        }
        const role = claim();
        if (role === "claimed") { claimedFail(); return true; }
        if (role === "sender") { json(res, 200, { role: "sender", card: publicView(card) }); return true; }
        if (!card.opened_at) {
          db.prepare(`UPDATE cards SET opened_at=?, status=CASE WHEN status='created' THEN 'opened' ELSE status END WHERE id=? AND opened_at IS NULL`).run(now(), card.id);
          logEvent(card.id, "card_opened", url.searchParams.get("source") || card.source);
        }
        const fresh = db.prepare(`SELECT * FROM cards WHERE id=?`).get(card.id);
        json(res, 200, { role: "recipient", card: { ...publicView(fresh, { reveal: true }), myAnswers: attemptsFor(card.id, viewer.id).map(({ answeredBy, ...rest }) => rest) } }); return true;
      }
      if (action === "answer" && method === "POST") {
        const body = await readJson(req, 4096);
        const guess = typeof body.answer === "string" ? body.answer.trim().slice(0, 60) : "";
        if (!guess) { fail(res, 400, "EMPTY_ANSWER", "先写个答案再提交嘛"); return true; }
        const role = claim();
        if (role === "login") { fail(res, 401, "AUTH_REQUIRED", "先登录再对暗号"); return true; }
        if (role === "sender") { fail(res, 403, "OWN_CARD", "自己出的题就别自己答啦，留给 TA"); return true; }
        if (role === "claimed") { claimedFail(); return true; }
        if (card.unlocked_at) { json(res, 200, { correct: true, card: publicView(card, { reveal: true }) }); return true; }
        if (card.attempts >= MAX_ATTEMPTS) { json(res, 200, { correct: false, card: publicView(card) }); return true; }
        // Reserve the attempt before any model call so concurrent submits cannot exceed 3 tries.
        const reserved = db.prepare(`UPDATE cards SET attempts=attempts+1 WHERE id=? AND attempts<? AND unlocked_at IS NULL`).run(card.id, MAX_ATTEMPTS);
        if (!reserved.changes) { json(res, 200, { correct: false, card: publicView(db.prepare(`SELECT * FROM cards WHERE id=?`).get(card.id)) }); return true; }
        const attempt = card.attempts + 1;
        const answers = [card.answer, ...JSON.parse(card.alt_answers || "[]")];
        let correct = localMatch(guess, answers);
        let judgedBy = "local";
        if (!correct && !cardSafetyIssue(guess)) {
          const verdict = await getHarness().judge({ actorId: `card:${card.id}`, question: card.question, answer: answers.join(" / "), guess });
          if (verdict.source === "model") { correct = verdict.correct; judgedBy = "ai"; }
        }
        const stamp = now();
        db.prepare(`INSERT INTO card_attempts(id,card_id,user_id,guess,correct,created_at) VALUES(?,?,?,?,?,?)`).run(id("cat"), card.id, viewer.id, guess, correct ? 1 : 0, stamp);
        const unlocked = correct && db.prepare(`UPDATE cards SET unlocked_at=?, failed_at=NULL, status=CASE WHEN status='replied' THEN status ELSE 'unlocked' END WHERE id=? AND unlocked_at IS NULL`).run(stamp, card.id).changes;
        if (!correct) db.prepare(`UPDATE cards SET failed_at=?, status='failed' WHERE id=? AND attempts>=? AND unlocked_at IS NULL AND status!='replied'`).run(stamp, card.id, MAX_ATTEMPTS);
        const source = url.searchParams.get("source") || card.source;
        logEvent(card.id, "answer_tried", source, { attempt, correct });
        if (unlocked) logEvent(card.id, "card_unlocked", source, { attempt });
        const fresh = db.prepare(`SELECT * FROM cards WHERE id=?`).get(card.id);
        json(res, 200, { correct, judgedBy, attempt, card: { ...publicView(fresh, { reveal: true }), myAnswers: attemptsFor(card.id, viewer.id).map(({ answeredBy, ...rest }) => rest) } }); return true;
      }
      if (action === "event" && method === "POST") {
        const body = await readJson(req, 2048);
        if (body.eventName !== "reply_started") { fail(res, 400, "INVALID_EVENT", "不支持的事件"); return true; }
        logEvent(card.id, "reply_started", url.searchParams.get("source") || card.source);
        json(res, 202, { accepted: true }); return true;
      }
      if (action === "feedback" && method === "POST") {
        const body = await readJson(req, 4096);
        const kind = body.kind === "report" ? "report" : "feedback";
        const count = db.prepare(`SELECT COUNT(*) AS n FROM card_feedback WHERE card_id=?`).get(card.id).n;
        if (count >= FEEDBACK_LIMIT) { fail(res, 429, "TOO_MANY_FEEDBACK", "收到啦，已经够多了"); return true; }
        const reason = kind === "report" ? (REPORT_REASONS.includes(body.reason) ? body.reason : "other") : (["yes", "no", "maybe"].includes(body.reason) ? body.reason : "");
        const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, 200) : "";
        db.prepare(`INSERT INTO card_feedback(id,card_id,kind,reason,detail,created_at) VALUES(?,?,?,?,?,?)`).run(id("cfb"), card.id, kind, reason, detail, now());
        if (kind === "feedback") logEvent(card.id, "feedback_sent", url.searchParams.get("source") || card.source);
        json(res, 201, { ok: true }); return true;
      }
      fail(res, 405, "METHOD_NOT_ALLOWED", "不支持的请求"); return true;
    }

    const groupPub = path.match(/^\/api\/card-groups\/public\/([^/]+)(?:\/(entries))?$/);
    if (groupPub) {
      const group = /^[A-Za-z0-9_-]{16,64}$/.test(groupPub[1]) ? db.prepare(`SELECT * FROM card_groups WHERE token=? AND expires_at>?`).get(groupPub[1], now()) : null;
      if (!group) { fail(res, 404, "GROUP_NOT_FOUND", "这个起哄小组不存在或已过期"); return true; }
      const owner = db.prepare(`SELECT nickname FROM users WHERE id=?`).get(group.owner_id);
      const entryCount = () => db.prepare(`SELECT COUNT(*) AS n FROM card_group_entries WHERE group_id=?`).get(group.id).n;
      if (!groupPub[2] && method === "GET") { json(res, 200, { group: { title: group.title, ownerName: owner?.nickname || "一位朋友", entryCount: entryCount() } }); return true; }
      if (groupPub[2] && method === "POST") {
        if (entryCount() >= GROUP_ENTRY_LIMIT) { fail(res, 429, "GROUP_FULL", "料已经够多啦，交给发起人出题吧"); return true; }
        const body = await readJson(req, 4096);
        const authorName = safeText(body.authorName, 12, "你的称呼");
        const text = safeText(body.text, 300, "爆料");
        db.prepare(`INSERT INTO card_group_entries(id,group_id,author_name,text,created_at) VALUES(?,?,?,?,?)`).run(id("cge"), group.id, authorName, text, now());
        json(res, 201, { ok: true, entryCount: entryCount() }); return true;
      }
      fail(res, 405, "METHOD_NOT_ALLOWED", "不支持的请求"); return true;
    }

    // ---- Sender endpoints (phone + beta code login) ----
    const user = requireUser(req, res, url); if (!user) return true;

    if (path === "/api/card-groups" && method === "POST") {
      const body = await readJson(req, 4096);
      const title = safeText(body.title || "一起整蛊 TA", 30, "小组名");
      const group = { id: id("cgp"), token: token(18), title };
      db.prepare(`INSERT INTO card_groups(id,token,owner_id,title,expires_at,created_at) VALUES(?,?,?,?,?,?)`).run(group.id, group.token, user.id, title, addDays(CARD_TTL_DAYS), now());
      json(res, 201, { group: { ...group, shareUrl: `${publicBaseUrl(req)}/card.html#g=${group.token}`, entries: [] } }); return true;
    }
    const groupOwn = path.match(/^\/api\/card-groups\/([^/]+)$/);
    if (groupOwn) {
      const group = db.prepare(`SELECT * FROM card_groups WHERE id=? AND owner_id=?`).get(groupOwn[1], user.id);
      if (!group) { fail(res, 404, "GROUP_NOT_FOUND", "没有找到这个小组"); return true; }
      if (method === "GET") {
        const entries = db.prepare(`SELECT id, author_name AS authorName, text, created_at AS createdAt FROM card_group_entries WHERE group_id=? ORDER BY created_at`).all(group.id);
        json(res, 200, { group: { id: group.id, token: group.token, title: group.title, shareUrl: `${publicBaseUrl(req)}/card.html#g=${group.token}`, entries } }); return true;
      }
      if (method === "DELETE") { db.prepare(`DELETE FROM card_groups WHERE id=?`).run(group.id); json(res, 200, { ok: true }); return true; }
    }

    if (path === "/api/cards/suggest" && method === "POST") {
      const body = await readJson(req, 16 * 1024);
      const memories = [];
      if (typeof body.memory === "string" && body.memory.trim()) memories.push(safeText(body.memory, 600, "共同记忆"));
      if (body.groupId) {
        const group = db.prepare(`SELECT * FROM card_groups WHERE id=? AND owner_id=?`).get(String(body.groupId), user.id);
        if (!group) { fail(res, 404, "GROUP_NOT_FOUND", "没有找到这个小组"); return true; }
        for (const entry of db.prepare(`SELECT author_name, text FROM card_group_entries WHERE group_id=? ORDER BY created_at`).all(group.id)) memories.push(`${entry.author_name} 爆料：${entry.text}`);
      }
      if (!memories.length) { fail(res, 400, "INVALID_CARD", "先写一段你们的共同记忆"); return true; }
      const result = await getHarness().suggest({ actorId: user.id, memories, tone: "tease" });
      json(res, 200, { questions: result.questions, source: result.source, reason: result.reason || null, aiAssisted: result.source === "model" }); return true;
    }

    if (path === "/api/cards/received" && method === "GET") {
      const cards = db.prepare(`SELECT * FROM cards WHERE recipient_id=? ORDER BY created_at DESC LIMIT 50`).all(user.id);
      json(res, 200, { cards: cards.map((card) => receivedView(card, req)) }); return true;
    }

    if (path === "/api/cards" && method === "GET") {
      const cards = db.prepare(`SELECT * FROM cards WHERE sender_id=? ORDER BY created_at DESC LIMIT 50`).all(user.id);
      const today = new Date().toISOString().slice(0, 10);
      const usedToday = usage(user.id, today);
      json(res, 200, { cards: cards.map((card) => ownerView(card, req)), dailyLimit: CARD_DAILY_LIMIT, remainingToday: Math.max(0, CARD_DAILY_LIMIT - usedToday) }); return true;
    }

    if (path === "/api/cards" && method === "POST") {
      const body = await readJson(req, 16 * 1024);
      if (body.adult !== true) { fail(res, 400, "ADULT_CONFIRM_REQUIRED", "暗号卡内测仅限 18 岁以上，请先确认"); return true; }
      const today = new Date().toISOString().slice(0, 10);
      // Usage is counted separately so deleting cards cannot reset the daily limit.
      const usedToday = usage(user.id, today);
      if (usedToday >= CARD_DAILY_LIMIT) { fail(res, 429, "CARD_DAILY_LIMIT", `今天已经发了 ${CARD_DAILY_LIMIT} 张，留点悬念明天再整蛊吧`); return true; }
      const unlockType = UNLOCK_TYPES.includes(body.unlockType) ? body.unlockType : null;
      if (!unlockType) { fail(res, 400, "INVALID_CARD", "选一种解锁内容：一段话、小惊喜或约见邀请"); return true; }
      const question = safeText(body.question, 60, "暗号题");
      const answer = safeText(body.answer, 20, "答案");
      const altAnswers = (Array.isArray(body.altAnswers) ? body.altAnswers : []).slice(0, 5).map((item) => safeText(String(item), 20, "备选答案", { required: false })).filter(Boolean);
      const hint = safeText(body.hint, 40, "提示", { required: false });
      const content = safeText(body.content, 500, "解锁内容");
      const inviteWhen = unlockType === "invite" ? safeText(body.inviteWhen, 40, "约见时间") : "";
      const inviteWhere = unlockType === "invite" ? safeText(body.inviteWhere, 40, "约见地点", { required: false }) : "";
      const penalty = safeText(body.penalty, 40, "惩罚", { required: false });
      let replyTo = null;
      if (body.replyToToken) {
        replyTo = cardByToken(String(body.replyToToken));
        if (!replyTo || !replyTo.unlocked_at || (replyTo.recipient_id && replyTo.recipient_id !== user.id) || replyTo.sender_id === user.id) { fail(res, 400, "REPLY_NOT_ALLOWED", "先解开原卡才能回卡哦"); return true; }
        if (!replyTo.recipient_id) db.prepare(`UPDATE cards SET recipient_id=? WHERE id=? AND recipient_id IS NULL`).run(user.id, replyTo.id);
      }
      let groupId = null;
      if (body.groupId) {
        const group = db.prepare(`SELECT id FROM card_groups WHERE id=? AND owner_id=?`).get(String(body.groupId), user.id);
        if (!group) { fail(res, 404, "GROUP_NOT_FOUND", "没有找到这个小组"); return true; }
        groupId = group.id;
      }
      const source = replyTo ? "reply" : cleanSource(body.source);
      const card = { id: id("card"), token: token(18) };
      const stamp = now();
      db.prepare(`INSERT INTO cards(id,token,sender_id,reply_to_card_id,group_id,unlock_type,question,answer,alt_answers,hint,content,invite_when,invite_where,penalty,sender_name,ai_assisted,source,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(card.id, card.token, user.id, replyTo?.id || null, groupId, unlockType, question, answer, JSON.stringify(altAnswers), hint, content, inviteWhen, inviteWhere, penalty,
          safeText(body.senderName || user.nickname, 12, "署名", { required: false }) || "一位朋友", body.aiAssisted ? 1 : 0, source, addDays(CARD_TTL_DAYS), stamp);
      db.prepare(`INSERT INTO card_daily_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1`).run(user.id, today);
      logEvent(card.id, "card_created", source);
      if (replyTo) {
        db.prepare(`UPDATE cards SET replied_at=?, status='replied' WHERE id=?`).run(stamp, replyTo.id);
        logEvent(replyTo.id, "reply_created", replyTo.source);
        ensureFriendship(user, replyTo.sender_id);
      }
      json(res, 201, { card: ownerView(db.prepare(`SELECT * FROM cards WHERE id=?`).get(card.id), req) }); return true;
    }

    const own = path.match(/^\/api\/cards\/([^/]+)(?:\/(copied|hint|accept-answer))?$/);
    if (own) {
      const card = db.prepare(`SELECT * FROM cards WHERE id=? AND sender_id=?`).get(own[1], user.id);
      if (!card) { fail(res, 404, "CARD_NOT_FOUND", "没有找到这张卡"); return true; }
      if (own[2] === "hint" && method === "POST") {
        const body = await readJson(req, 4096);
        const hint = safeText(body.hint, 40, "补充提示");
        db.prepare(`UPDATE cards SET extra_hint=? WHERE id=? AND sender_id=?`).run(hint, card.id, user.id);
        json(res, 200, { card: ownerView(db.prepare(`SELECT * FROM cards WHERE id=?`).get(card.id), req) }); return true;
      }
      if (own[2] === "accept-answer" && method === "POST") {
        const body = await readJson(req, 4096);
        if (typeof body.attemptId !== "string" || !body.attemptId.trim()) { fail(res, 400, "INVALID_ATTEMPT", "请选择一条已提交的错误答案"); return true; }
        const attempt = db.prepare(`SELECT a.* FROM card_attempts a JOIN cards c ON c.id=a.card_id WHERE a.id=? AND c.id=? AND c.sender_id=? AND a.user_id=c.recipient_id`).get(body.attemptId, card.id, user.id);
        if (!attempt) { fail(res, 404, "ATTEMPT_NOT_FOUND", "没有找到这张卡收卡人的答案"); return true; }
        if (!attempt.guess.trim() || (attempt.correct && !attempt.accepted_at)) { fail(res, 400, "INVALID_ATTEMPT", "只能将已提交的错误答案判对"); return true; }
        const stamp = now();
        db.prepare(`UPDATE card_attempts SET correct=1, accepted_at=COALESCE(accepted_at,?) WHERE id=?`).run(stamp, attempt.id);
        const unlocked = db.prepare(`UPDATE cards SET unlocked_at=?, failed_at=NULL, status=CASE WHEN status='replied' THEN status ELSE 'unlocked' END WHERE id=? AND unlocked_at IS NULL`).run(stamp, card.id).changes;
        if (unlocked) logEvent(card.id, "card_unlocked", card.source, { attempt: card.attempts });
        json(res, 200, { card: ownerView(db.prepare(`SELECT * FROM cards WHERE id=?`).get(card.id), req) }); return true;
      }
      if (own[2] === "copied" && method === "POST") { logEvent(card.id, "card_copied", card.source); json(res, 202, { accepted: true }); return true; }
      if (!own[2] && method === "GET") { json(res, 200, { card: ownerView(card, req) }); return true; }
      if (!own[2] && method === "DELETE") { deleteCard(card.id); json(res, 200, { ok: true, deleted: true }); return true; }
    }
    fail(res, 404, "NOT_FOUND", "接口不存在"); return true;
  }

  return { handle, funnel, logEvent };
}
