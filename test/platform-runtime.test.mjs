import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIcebreakerHarness } from "../llm/icebreaker.mjs";
import { createReplyDraftHarness } from "../llm/reply-draft.mjs";
import { createAgentConfigStore } from "../agent-config.mjs";

const iceInput = { actorId: "synthetic-actor", echoId: "echo", context: { title: "公园", reaction: "想去散步", question: "你喜欢什么风景？" } };
const replyInput = { actorId: "synthetic-actor", threadKey: "echo:test", context: { title: "公园", reaction: "想去散步", recentMessages: [] } };
const iceOutput = { suggestions: ["你会留意树影吗？", "你通常走哪条路？", "你喜欢傍晚的风景吗？"] };
const replyOutput = { draft: "你最喜欢哪一种树影？" };
const enabled = { ANHAO_LLM_ENABLED: "true" };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// The public adapter rejects SQL transaction control, as DO SQLite does.
function durableLedger(t) {
  const native = new DatabaseSync(":memory:");
  t.after(() => native.close());
  const stats = { closes: 0, transactions: 0 };
  const db = {
    exec(sql) {
      assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT|ROLLBACK|PRAGMA)\b/i);
      return native.exec(sql);
    },
    prepare: sql => native.prepare(sql),
    transaction(callback) {
      stats.transactions += 1;
      native.exec("BEGIN IMMEDIATE");
      try {
        const result = callback();
        native.exec("COMMIT");
        return result;
      } catch (error) {
        native.exec("ROLLBACK");
        throw error;
      }
    },
    close() { stats.closes += 1; }
  };
  return { db, stats, rows: () => native.prepare("SELECT * FROM runs ORDER BY rowid").all() };
}

for (const [name, create, input, output] of [
  ["icebreaker", createIcebreakerHarness, iceInput, iceOutput],
  ["reply", createReplyDraftHarness, replyInput, replyOutput]
]) {
  test(`${name}: shared DO ledger persists reservations across runtime retirement`, async t => {
    const ledger = durableLedger(t);
    const options = { env: { ...enabled, ANHAO_LLM_DAILY_LIMIT: "1" }, ledgerFactory: () => ledger.db, provider: async () => ({ output }) };
    const first = create(options);
    assert.equal((await first.suggest(input)).source, "model");
    await first.retire();
    const second = create({ ...options, provider: () => assert.fail("persisted quota called provider") });
    assert.equal((await second.suggest(input)).reason, "daily_limit");
    await second.close();
    assert.equal(ledger.rows().length, 1);
    assert.equal(ledger.rows()[0].status, "model");
    assert.equal(ledger.stats.transactions, 2);
    assert.equal(ledger.rows()[0].actor.includes(input.actorId), false);
  });

  test(`${name}: zero quota never initializes an async ledger`, async () => {
    for (const key of ["ANHAO_LLM_DAILY_LIMIT", "ANHAO_LLM_USER_DAILY_LIMIT"]) {
      const harness = create({ env: { ...enabled, [key]: "0" }, ledgerFactory: async () => assert.fail("zero quota opened ledger"), provider: () => assert.fail("zero quota called provider") });
      assert.equal((await harness.suggest(input)).reason, "daily_limit");
      await harness.close();
    }
  });

  test(`${name}: retire waits for async initialization and closes exactly once`, async t => {
    const ledger = durableLedger(t);
    const loading = deferred();
    let factories = 0;
    const harness = create({ env: enabled, ledgerFactory: () => { factories += 1; return loading.promise; }, provider: () => assert.fail("retired initialization called provider") });
    const requests = [harness.suggest(input), harness.suggest(input)];
    const retiring = harness.retire();
    let closed = false;
    retiring.then(() => { closed = true; });
    await Promise.resolve();
    assert.equal(closed, false);
    assert.equal(factories, 1);
    loading.resolve(ledger.db);
    assert.deepEqual((await Promise.all(requests)).map(row => row.reason), ["retired", "retired"]);
    await retiring;
    assert.equal(ledger.stats.closes, 1);
    assert.equal(harness.close(), retiring);
    assert.equal(ledger.rows().length, 0);
  });
}

test("async initialization rechecks shared concurrency across features before reserving quota", async t => {
  const ledger = durableLedger(t);
  const loading = deferred();
  const started = deferred();
  const finish = deferred();
  const sharedConcurrency = { active: 0 };
  const options = { env: { ...enabled, ANHAO_LLM_CONCURRENCY: "1" }, ledgerFactory: () => loading.promise, sharedConcurrency };
  const ice = createIcebreakerHarness({ ...options, provider: () => { started.resolve(); return finish.promise; } });
  const reply = createReplyDraftHarness({ ...options, provider: () => assert.fail("concurrent initialization exceeded slot") });
  const first = ice.suggest(iceInput);
  const second = reply.suggest(replyInput);
  loading.resolve(ledger.db);
  await started.promise;
  assert.equal((await second).reason, "busy");
  assert.equal(sharedConcurrency.active, 1);
  assert.equal(ledger.rows().length, 1);
  const retirement = ice.retire();
  assert.equal((await first).reason, "retired");
  assert.equal(sharedConcurrency.active, 1);
  assert.equal(ledger.stats.closes, 0);
  finish.resolve({ output: iceOutput });
  await retirement;
  assert.equal(sharedConcurrency.active, 0);
  assert.equal(ledger.stats.closes, 1);
  await reply.close();
});

test("async initialization rechecks persistent quota before concurrent admissions", async t => {
  const ledger = durableLedger(t);
  const loading = deferred();
  const finish = deferred();
  const started = deferred();
  const harness = createIcebreakerHarness({ env: { ...enabled, ANHAO_LLM_DAILY_LIMIT: "1" }, ledgerFactory: () => loading.promise, provider: () => { started.resolve(); return finish.promise; } });
  const first = harness.suggest(iceInput);
  const second = harness.suggest({ ...iceInput, actorId: "another-synthetic-actor" });
  loading.resolve(ledger.db);
  await started.promise;
  assert.equal((await second).reason, "daily_limit");
  finish.resolve({ output: iceOutput });
  assert.equal((await first).source, "model");
  assert.equal(ledger.rows().length, 1);
  await harness.close();
});

test("failed async initialization is retryable and retirement does not wait forever", async () => {
  const loading = deferred();
  const harness = createIcebreakerHarness({ env: enabled, ledgerFactory: () => loading.promise, provider: () => assert.fail("failed initialization called provider") });
  const request = harness.suggest(iceInput);
  const retirement = harness.retire();
  loading.reject(new Error("synthetic unavailable ledger"));
  assert.equal((await request).reason, "retired");
  await retirement;
  const retry = createIcebreakerHarness({ env: enabled, ledgerFactory: async () => { throw new Error("synthetic unavailable ledger"); } });
  assert.equal((await retry.suggest(iceInput)).reason, "ledger_unavailable");
  assert.equal((await retry.suggest(iceInput)).reason, "ledger_unavailable");
  await retry.close();
});

test("default Node loader persists quota without an explicit ledgerFactory", async t => {
  const dir = mkdtempSync(join(tmpdir(), "anhao-platform-runtime-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const options = { env: { ...enabled, DATA_DIR: dir, ANHAO_LLM_DAILY_LIMIT: "1" }, provider: async () => ({ output: iceOutput }) };
  const first = createIcebreakerHarness(options);
  assert.equal((await first.suggest(iceInput)).source, "model");
  await first.close();
  const second = createReplyDraftHarness({ ...options, provider: () => assert.fail("reopened quota called provider") });
  assert.equal((await second.suggest(replyInput)).reason, "daily_limit");
  await second.close();
});

test("agent configuration uses adapter transactions and preserves revision conflict rollback", t => {
  const ledger = durableLedger(t);
  const store = createAgentConfigStore({ db: ledger.db, env: { ANHAO_LLM_ENABLED: "false" } });
  const initial = store.snapshot();
  const saved = store.save({ expectedRevision: 1, settings: { ...initial.settings, globalDailyLimit: 0 }, reason: "合成配置" });
  assert.equal(saved.revision, 2);
  assert.throws(() => store.save({ expectedRevision: 1, settings: initial.settings, reason: "过时配置" }), { code: "CONFIG_CONFLICT" });
  assert.equal(store.history().length, 2);
  const restored = store.rollback({ expectedRevision: 2, revision: 1, reason: "恢复配置" });
  assert.equal(restored.revision, 3);
  assert.equal(ledger.stats.transactions, 3);
});
