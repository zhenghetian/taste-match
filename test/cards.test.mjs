import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { cardSafetyIssue } from "../card-safety.mjs";
import { createCardHarness, validateQuestions, FALLBACK_QUESTIONS } from "../llm/card-quiz.mjs";

const PORT = 4211;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "anhao-cards-"));
let server;

async function raw(path, { token, method = "GET", body, admin } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": "test-admin" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, body: await response.json() };
}
async function ok(path, options) {
  const result = await raw(path, options);
  assert.ok(result.status < 400, `${options?.method || "GET"} ${path}: ${JSON.stringify(result.body)}`);
  return result.body;
}
async function login(phone) {
  await ok("/api/auth/send-code", { method: "POST", body: { phone } });
  return (await ok("/api/auth/verify", { method: "POST", body: { phone, code: "123456" } })).token;
}
const tokenOf = (card) => card.shareUrl.split("#c=")[1];
const baseCard = (extra = {}) => ({ question: "孜然王子是谁？", answer: "老王", altAnswers: ["王哥"], hint: "姓王", unlockType: "message", content: "周末烧烤我请！", penalty: "请全组喝奶茶", senderName: "损友团", source: "x", adult: true, ...extra });
const dbQuery = (sql, ...args) => { const db = new DatabaseSync(join(dataDir, "anhao.db")); try { return db.prepare(sql).all(...args); } finally { db.close(); } };
const dbRun = (sql, ...args) => { const db = new DatabaseSync(join(dataDir, "anhao.db")); try { return db.prepare(sql).run(...args); } finally { db.close(); } };

test.before(async () => {
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: "production", BETA_TEST_CODE: "123456", SMS_WEBHOOK_URL: "", ADMIN_KEY: "test-admin", DEMO_MATCHING_ENABLED: "false", ANHAO_LLM_ENABLED: "false", PUBLIC_URL: "https://anhao.example" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("cards test server did not start");
});
test.after(() => { server?.kill("SIGTERM"); rmSync(dataDir, { recursive: true, force: true }); });

test("home page serves the card UI and the legacy chat page stays reachable", async () => {
  const home = await fetch(`${BASE}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /暗号卡/);
  assert.equal((await fetch(`${BASE}/card.html`)).status, 200);
});

test("sender auth required; suggest falls back to templates when AI is disabled", async () => {
  assert.equal((await raw("/api/cards")).status, 401);
  const token = await login("13900000001");
  const result = await ok("/api/cards/suggest", { token, method: "POST", body: { memory: "大二半夜吃烧烤，老王把孜然当辣椒面" } });
  assert.equal(result.source, "fallback");
  assert.equal(result.aiAssisted, false);
  assert.equal(result.questions.length, 3);
  const unsafe = await raw("/api/cards/suggest", { token, method: "POST", body: { memory: "他身份证号是 110101199003077777" } });
  assert.equal(unsafe.status, 422);
});

test("create requires 18+ confirmation and rejects unsafe text", async () => {
  const token = await login("13900000002");
  assert.equal((await raw("/api/cards", { token, method: "POST", body: baseCard({ adult: false }) })).body.error.code, "ADULT_CONFIRM_REQUIRED");
  const bad = await raw("/api/cards", { token, method: "POST", body: baseCard({ content: "你家住在幸福路 18 号 3 单元 501 室" }) });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, "CARD_UNSAFE");
  assert.equal((await raw("/api/cards", { token, method: "POST", body: baseCard({ unlockType: "nope" }) })).status, 400);
});

test("recipient flow: open once, hint after miss, no content leak, unlock reveals", async () => {
  const token = await login("13900000003");
  const { card } = await ok("/api/cards", { token, method: "POST", body: baseCard() });
  assert.equal(card.status, "created");
  assert.match(card.shareUrl, /^https:\/\/anhao\.example\/card\.html#c=/);
  const t = tokenOf(card);
  await ok(`/api/cards/${card.id}/copied`, { token, method: "POST" });

  const first = (await ok(`/api/cards/public/${t}?source=x`)).card;
  assert.equal(first.question, "孜然王子是谁？");
  assert.equal(first.content, undefined);
  assert.equal(first.hint, "");
  assert.equal(first.attemptsLeft, 3);
  assert.equal(first.aiAssisted, false);
  await ok(`/api/cards/public/${t}`);
  assert.equal(dbQuery(`SELECT COUNT(*) AS n FROM card_events WHERE card_id=? AND event_name='card_opened'`, card.id)[0].n, 1);

  const miss = await ok(`/api/cards/public/${t}/answer`, { method: "POST", body: { answer: "小李" } });
  assert.equal(miss.correct, false);
  assert.equal(miss.card.hint, "姓王");
  assert.equal(miss.card.content, undefined);
  assert.equal(miss.card.penalty, undefined);

  const hit = await ok(`/api/cards/public/${t}/answer`, { method: "POST", body: { answer: " 王哥！" } });
  assert.equal(hit.correct, true);
  assert.equal(hit.card.content, "周末烧烤我请！");
  const mine = await ok(`/api/cards/${card.id}`, { token });
  assert.equal(mine.card.status, "unlocked");
  assert.equal(mine.card.attempts, 2);
});

test("three wrong answers lock the card and show the penalty without content", async () => {
  const token = await login("13900000004");
  const { card } = await ok("/api/cards", { token, method: "POST", body: baseCard() });
  const t = tokenOf(card);
  let last;
  for (const answer of ["a", "b", "c"]) last = await ok(`/api/cards/public/${t}/answer`, { method: "POST", body: { answer } });
  assert.equal(last.card.failed, true);
  assert.equal(last.card.penalty, "请全组喝奶茶");
  assert.equal(last.card.content, undefined);
  const after = await ok(`/api/cards/public/${t}/answer`, { method: "POST", body: { answer: "老王" } });
  assert.equal(after.correct, false);
  assert.equal(after.card.content, undefined);
  assert.equal((await ok(`/api/cards/${card.id}`, { token })).card.status, "failed");
});

test("reply needs an unlocked card, marks it replied and creates a friendship", async () => {
  const alice = await login("13900000005");
  const bob = await login("13900000006");
  const { card } = await ok("/api/cards", { token: alice, method: "POST", body: baseCard() });
  const t = tokenOf(card);
  assert.equal((await raw("/api/cards", { token: bob, method: "POST", body: baseCard({ replyToToken: t }) })).body.error.code, "REPLY_NOT_ALLOWED");
  await ok(`/api/cards/public/${t}/answer`, { method: "POST", body: { answer: "老王" } });
  await ok(`/api/cards/public/${t}/event`, { method: "POST", body: { eventName: "reply_started" } });
  assert.equal((await raw(`/api/cards/public/${t}/event`, { method: "POST", body: { eventName: "card_created" } })).status, 400);
  const reply = await ok("/api/cards", { token: bob, method: "POST", body: baseCard({ replyToToken: t, question: "那你记得我外号吗？" }) });
  assert.equal(reply.card.source, "reply");
  assert.equal((await ok(`/api/cards/${card.id}`, { token: alice })).card.status, "replied");
  const friends = await ok("/api/friends", { token: alice });
  assert.equal(friends.friends.length, 1);
  const pub = (await ok(`/api/cards/public/${tokenOf(reply.card)}`)).card;
  assert.equal(pub.isReply, true);
});

test("daily limit of 10 cannot be reset by deleting cards; delete is permanent", async () => {
  const token = await login("13900000007");
  let last;
  for (let i = 0; i < 10; i += 1) last = (await ok("/api/cards", { token, method: "POST", body: baseCard() })).card;
  assert.equal((await raw("/api/cards", { token, method: "POST", body: baseCard() })).status, 429);
  await ok(`/api/cards/${last.id}`, { token, method: "DELETE" });
  assert.equal((await raw("/api/cards", { token, method: "POST", body: baseCard() })).status, 429);
  assert.equal((await raw(`/api/cards/public/${tokenOf(last)}`)).status, 404);
  assert.equal(dbQuery(`SELECT COUNT(*) AS n FROM cards WHERE id=?`, last.id)[0].n, 0);
  // Funnel events survive deletion but carry no card text.
  assert.ok(dbQuery(`SELECT COUNT(*) AS n FROM card_events WHERE card_id=?`, last.id)[0].n >= 1);
  assert.equal((await ok("/api/cards", { token })).remainingToday, 0);
  // other users can still view their own list
  const other = await ok("/api/cards", { token });
  assert.equal(other.cards.length, 9);
});

test("expired cards are not reachable and get purged", async () => {
  const token = await login("13900000008");
  const { card } = await ok("/api/cards", { token, method: "POST", body: baseCard() });
  assert.ok(new Date(card.expiresAt) - Date.now() > 29 * 86_400_000);
  dbRun(`UPDATE cards SET expires_at=? WHERE id=?`, new Date(Date.now() - 1000).toISOString(), card.id);
  assert.equal((await raw(`/api/cards/public/${tokenOf(card)}`)).status, 404);
  assert.equal(dbQuery(`SELECT COUNT(*) AS n FROM cards WHERE id=?`, card.id)[0].n, 0);
});

test("events never store card text; feedback/report and admin funnel work", async () => {
  const token = await login("13900000009");
  const { card } = await ok("/api/cards", { token, method: "POST", body: baseCard({ source: "xhs", content: "秘密内容ABC" }) });
  const t = tokenOf(card);
  await ok(`/api/cards/public/${t}?source=xhs`);
  await ok(`/api/cards/public/${t}/answer?source=xhs`, { method: "POST", body: { answer: "老王" } });
  await ok(`/api/cards/public/${t}/feedback`, { method: "POST", body: { kind: "feedback", reason: "yes" } });
  await ok(`/api/cards/public/${t}/feedback`, { method: "POST", body: { kind: "report", reason: "insult", detail: "测试举报" } });
  const events = dbQuery(`SELECT * FROM card_events`);
  const dump = JSON.stringify(events);
  for (const secret of ["秘密内容ABC", "孜然王子", "老王", "姓王", "奶茶"]) assert.equal(dump.includes(secret), false, secret);

  assert.equal((await raw("/api/admin/cards/funnel?days=7")).status, 401);
  const funnel = await ok("/api/admin/cards/funnel?days=7", { admin: true });
  assert.equal(funnel.events.length, 8);
  assert.ok(funnel.totals.card_created >= 1);
  assert.ok(funnel.bySource.xhs.card_unlocked >= 1);
  assert.ok(funnel.bySource.xhs.feedback_sent >= 1);
  assert.ok(funnel.reports.some((r) => r.kind === "report" && r.reason === "insult"));
  await ok(`/api/admin/cards/${card.id}`, { method: "DELETE", admin: true });
  assert.equal((await raw(`/api/cards/public/${t}`)).status, 404);
});

test("group mode: co-authors add entries without login; owner generates from them", async () => {
  const token = await login("13900000010");
  const { group } = await ok("/api/card-groups", { token, method: "POST", body: { title: "整蛊老王行动组" } });
  const gt = group.shareUrl.split("#g=")[1];
  const info = await ok(`/api/card-groups/public/${gt}`);
  assert.equal(info.group.title, "整蛊老王行动组");
  await ok(`/api/card-groups/public/${gt}/entries`, { method: "POST", body: { authorName: "二胖", text: "老王唱 K 必点《死了都要爱》" } });
  assert.equal((await raw(`/api/card-groups/public/${gt}/entries`, { method: "POST", body: { authorName: "x", text: "他银行卡密码是 123456" } })).status, 422);
  const detail = await ok(`/api/card-groups/${group.id}`, { token });
  assert.equal(detail.group.entries.length, 1);
  const suggest = await ok("/api/cards/suggest", { token, method: "POST", body: { groupId: group.id } });
  assert.equal(suggest.questions.length, 3);
  const { card } = await ok("/api/cards", { token, method: "POST", body: baseCard({ groupId: group.id }) });
  assert.equal((await ok(`/api/cards/public/${tokenOf(card)}`)).card.group, true);
  const stranger = await login("13900000011");
  assert.equal((await raw(`/api/card-groups/${group.id}`, { token: stranger })).status, 404);
});

test("card safety rules catch private or hurtful text and allow playful teasing", () => {
  for (const text of ["身份证 110101199003077777", "加我微信 abc12345", "他有抑郁症", "裸照发群里", "你这个废物", "银行卡密码"]) assert.ok(cardSafetyIssue(text), text);
  for (const text of ["老王把孜然当辣椒面", "谁先笑场的？", "请全组喝奶茶"]) assert.equal(cardSafetyIssue(text), null, text);
});

test("card harness uses the model when enabled and validates output", async () => {
  const calls = [];
  const provider = async ({ kind }) => {
    calls.push(kind);
    if (kind === "judge") return { output: { correct: true }, usage: {}, model: "mock" };
    return { output: { questions: [
      { question: "孜然王子是谁？", answer: "老王", hint: "姓王" },
      { question: "烧烤摊叫什么？", answer: "阿强", hint: "两个字" },
      { question: "那晚几点散的？", answer: "三点", hint: "很晚" }
    ] }, usage: {}, model: "mock" };
  };
  const harness = createCardHarness({ env: { ANHAO_LLM_ENABLED: "true", DEEPSEEK_API_KEY: "test" }, provider });
  try {
    const suggested = await harness.suggest({ actorId: "u1", memories: ["烧烤"] });
    assert.equal(suggested.source, "model");
    assert.equal(suggested.questions[0].answer, "老王");
    const verdict = await harness.judge({ actorId: "u1", question: "q", answer: "老王", guess: "王老师" });
    assert.equal(verdict.source, "model");
    assert.equal(verdict.correct, true);
    assert.deepEqual(calls, ["suggest", "judge"]);
  } finally { await harness.close?.(); }
  const disabled = createCardHarness({ env: { ANHAO_LLM_ENABLED: "false" }, provider });
  assert.equal((await disabled.suggest({ actorId: "u1", memories: ["x"] })).questions.length, FALLBACK_QUESTIONS.length);
  assert.equal((await disabled.judge({ actorId: "u1", question: "q", answer: "a", guess: "b" })).correct, false);
  await disabled.close?.();
  assert.throws(() => validateQuestions({ questions: [{ question: "你个废物叫啥", answer: "x", hint: "y" }, { question: "b", answer: "x", hint: "y" }, { question: "c", answer: "x", hint: "y" }] }));
});
