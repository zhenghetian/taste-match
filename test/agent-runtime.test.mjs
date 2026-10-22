import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { once } from "node:events";
import { createIcebreakerHarness, createAnthropicProvider } from "../llm/icebreaker.mjs";
import { createReplyDraftHarness, createAnthropicReplyProvider } from "../llm/reply-draft.mjs";

const iceInput = { actorId: "synthetic-actor", echoId: "echo", context: { title: "公园", reaction: "想去散步", question: "你喜欢什么风景？" } };
const replyInput = { actorId: "synthetic-actor", threadKey: "echo:test", context: { title: "公园", reaction: "想去散步", recentMessages: [{ role: "other", text: "喜欢树影" }] } };
const iceOutput = { suggestions: ["你会留意树影吗？", "你通常走哪条路？", "你喜欢傍晚的风景吗？"] };
const replyOutput = { draft: "你最喜欢哪一种树影？" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "anhao-agent-runtime-"));
  const harnesses = [];
  t.after(async () => {
    await Promise.all(harnesses.map((harness) => harness.close()));
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    make(create, options = {}) {
      const harness = create({ ...options, env: { ANHAO_LLM_ENABLED: "true", DATA_DIR: dir, ...options.env } });
      harnesses.push(harness);
      return harness;
    },
    rows() {
      const db = new DatabaseSync(join(dir, "ai-harness.db"), { readOnly: true });
      try { return db.prepare("SELECT * FROM runs ORDER BY rowid").all(); }
      finally { db.close(); }
    }
  };
}

for (const [name, create, input, output] of [["icebreaker", createIcebreakerHarness, iceInput, iceOutput], ["reply", createReplyDraftHarness, replyInput, replyOutput]]) {
  test(`${name}: zero global or user quota forbids all requests`, async (t) => {
    const f = fixture(t);
    for (const key of ["ANHAO_LLM_DAILY_LIMIT", "ANHAO_LLM_USER_DAILY_LIMIT"]) {
      const sharedConcurrency = { active: 0 };
      const harness = f.make(create, { env: { [key]: "0" }, sharedConcurrency, provider: () => assert.fail("zero quota called provider") });
      assert.equal((await harness.suggest(input)).reason, "daily_limit");
      assert.equal(sharedConcurrency.active, 0);
      assert.equal(harness.getActiveCount(), 0);
    }
  });

  test(`${name}: retire waits for ignored abort and persists once before closing`, async (t) => {
    const f = fixture(t);
    const sharedConcurrency = { active: 0 };
    const records = [];
    let finish, signal;
    const harness = f.make(create, { sharedConcurrency, record: (row) => records.push(row), provider: (request) => {
      signal = request.signal;
      return new Promise((resolve) => { finish = resolve; });
    } });
    const pending = harness.suggest(input);
    assert.equal(harness.status().active, 1);
    let retired = false;
    const retirement = harness.retire().then(() => { retired = true; });
    assert.equal(signal.aborted, true);
    assert.equal((await harness.suggest(input)).reason, "retired");
    assert.equal((await pending).reason, "retired");
    await tick();
    assert.equal(retired, false);
    assert.equal(sharedConcurrency.active, 1);
    assert.equal(f.rows()[0].status, "fallback");
    assert.equal(f.rows()[0].reason, "retired");
    finish({ output });
    await retirement;
    assert.equal(harness.getActiveCount(), 0);
    assert.equal(sharedConcurrency.active, 0);
    assert.equal(records.length, 1);
    assert.equal(f.rows()[0].reason, "retired");
    assert.equal(harness.close(), harness.retire());
  });
}

test("one concurrency counter gates features and old/new instances using the admitting config", async (t) => {
  const f = fixture(t);
  const sharedConcurrency = { active: 0 };
  let finishOld, finishNew;
  const old = f.make(createIcebreakerHarness, { sharedConcurrency, env: { ANHAO_LLM_CONCURRENCY: "2" }, provider: () => new Promise((resolve) => { finishOld = resolve; }) });
  const next = f.make(createReplyDraftHarness, { sharedConcurrency, env: { ANHAO_LLM_CONCURRENCY: "1" }, provider: () => new Promise((resolve) => { finishNew = resolve; }) });
  const pendingOld = old.suggest(iceInput);
  assert.equal((await next.suggest(replyInput)).reason, "busy");
  const retired = old.retire();
  await pendingOld;
  assert.equal((await next.suggest(replyInput)).reason, "busy");
  finishOld({ output: iceOutput });
  await retired;
  const pendingNew = next.suggest(replyInput);
  assert.equal(sharedConcurrency.active, 1);
  assert.equal((await next.suggest(replyInput)).reason, "busy");
  finishNew({ output: replyOutput });
  assert.equal((await pendingNew).source, "model");
  assert.equal(sharedConcurrency.active, 0);
});

test("a new instance with a higher concurrency limit can admit beside an old request", async (t) => {
  const f = fixture(t);
  const sharedConcurrency = { active: 0 };
  let finish;
  const old = f.make(createIcebreakerHarness, { sharedConcurrency, env: { ANHAO_LLM_CONCURRENCY: "1" }, provider: () => new Promise((resolve) => { finish = resolve; }) });
  const next = f.make(createReplyDraftHarness, { sharedConcurrency, env: { ANHAO_LLM_CONCURRENCY: "2" }, provider: async () => ({ output: replyOutput }) });
  const pending = old.suggest(iceInput);
  assert.equal((await next.suggest(replyInput)).source, "model");
  assert.equal(sharedConcurrency.active, 1);
  assert.equal((await old.suggest(iceInput)).reason, "busy");
  finish({ output: iceOutput });
  await pending;
  assert.equal(sharedConcurrency.active, 0);
});

test("feature instances share quota reservations and new runtime token/model settings", async (t) => {
  const f = fixture(t);
  let maxTokens;
  const ice = f.make(createIcebreakerHarness, { env: { ANHAO_LLM_DAILY_LIMIT: "1", ANHAO_LLM_MAX_TOKENS: "8192", ANHAO_LLM_MODEL: "synthetic-new-model" }, provider: async (request) => { maxTokens = request.maxTokens; return { output: iceOutput }; } });
  const reply = f.make(createReplyDraftHarness, { env: { ANHAO_LLM_DAILY_LIMIT: "1" }, provider: () => assert.fail("shared daily quota called provider") });
  assert.equal((await ice.suggest(iceInput)).source, "model");
  assert.equal(maxTokens, 8192);
  assert.equal(f.rows()[0].model, "synthetic-new-model");
  assert.equal((await reply.suggest(replyInput)).reason, "daily_limit");
  assert.equal(f.rows().length, 1);
});

test("timeout retains the provider slot until late rejection without a second ledger write", async (t) => {
  const f = fixture(t);
  let fail;
  const records = [];
  const sharedConcurrency = { active: 0 };
  const old = f.make(createIcebreakerHarness, { sharedConcurrency, env: { ANHAO_LLM_TIMEOUT_MS: "10", ANHAO_LLM_CONCURRENCY: "1" }, record: (row) => records.push(row), provider: () => new Promise((_, reject) => { fail = reject; }) });
  const next = f.make(createReplyDraftHarness, { sharedConcurrency, env: { ANHAO_LLM_CONCURRENCY: "1" }, provider: async () => ({ output: replyOutput }) });
  assert.equal((await old.suggest(iceInput)).reason, "timeout");
  assert.equal((await next.suggest(replyInput)).reason, "busy");
  const closing = old.close();
  assert.equal(old.status().active, 1);
  fail(new Error("late synthetic failure"));
  await closing;
  assert.equal(records.length, 1);
  assert.equal(f.rows()[0].reason, "timeout");
  assert.equal((await next.suggest(replyInput)).source, "model");
});

test("synchronous provider exceptions release concurrency and close after recording", async (t) => {
  const f = fixture(t);
  let closing;
  const harness = f.make(createReplyDraftHarness, { provider: () => { throw new Error("private failure details"); }, record: () => { closing = harness.close(); assert.equal(harness.getActiveCount(), 1); } });
  assert.equal((await harness.suggest(replyInput)).reason, "provider_error");
  await closing;
  assert.equal(harness.getActiveCount(), 0);
  assert.equal(f.rows()[0].reason, "provider_error");
});

test("auto switch blocks autoSend while ordinary drafts remain available", async (t) => {
  const f = fixture(t);
  const modes = [];
  const harness = f.make(createReplyDraftHarness, { env: { ANHAO_LLM_AUTO_REPLY_ENABLED: "false" }, provider: async ({ autoSend }) => { modes.push(autoSend); return { output: replyOutput }; } });
  assert.equal((await harness.suggest({ ...replyInput, autoSend: true })).reason, "disabled");
  assert.equal((await harness.suggest(replyInput)).source, "model");
  assert.deepEqual(modes, [false]);
});

test("prompt versions distinguish instructions and modes without storing prompts or secrets", async (t) => {
  const f = fixture(t);
  const records = [];
  const env = { ANHAO_LLM_REPLY_INSTRUCTION: "normal-private-instruction", ANHAO_LLM_AUTO_INSTRUCTION: "auto-private-instruction", ANTHROPIC_API_KEY: "synthetic-secret" };
  const options = { env, record: (row) => records.push(row), provider: async () => ({ output: replyOutput }) };
  const first = f.make(createReplyDraftHarness, options);
  await first.suggest(replyInput);
  await first.suggest({ ...replyInput, autoSend: true });
  const second = f.make(createReplyDraftHarness, { ...options, env: { ...env, ANHAO_LLM_REPLY_INSTRUCTION: "changed-private-instruction" } });
  await second.suggest(replyInput);
  const rows = f.rows();
  assert.equal(new Set(rows.map((row) => row.prompt_version)).size, 3);
  assert.equal(second.status().autoPromptVersion, first.status().autoPromptVersion);
  const serialized = JSON.stringify([rows, records, first.status(), second.status()]);
  for (const value of ["normal-private-instruction", "auto-private-instruction", "changed-private-instruction", "synthetic-secret", replyInput.actorId, replyInput.context.reaction, replyOutput.draft]) assert.equal(serialized.includes(value), false, value);
  const ice = f.make(createIcebreakerHarness, { env: { ANHAO_LLM_ICEBREAKER_INSTRUCTION: "ice-private-instruction" }, provider: async () => ({ output: iceOutput }) });
  await ice.suggest(iceInput);
  assert.match(f.rows().at(-1).prompt_version, /^icebreaker-v1:[0-9a-f]{64}$/);
});

test("instruction limits apply independently, including unicode characters", (t) => {
  const f = fixture(t);
  for (const [create, key] of [[createIcebreakerHarness, "ANHAO_LLM_ICEBREAKER_INSTRUCTION"], [createReplyDraftHarness, "ANHAO_LLM_REPLY_INSTRUCTION"], [createReplyDraftHarness, "ANHAO_LLM_AUTO_INSTRUCTION"]]) {
    f.make(create, { env: { [key]: "树".repeat(2000) } });
    assert.throws(() => f.make(create, { env: { [key]: "树".repeat(2001) } }), /invalid_configuration/);
  }
});

test("SDK keeps fixed safety rules and reads only the corresponding supplied env instruction", async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    event("message_start", { type: "message_start", message: { id: "msg_synthetic", type: "message", role: "assistant", model: "synthetic-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    event("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    event("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(requests.length === 1 ? iceOutput : replyOutput) } });
    event("content_block_stop", { type: "content_block_stop", index: 0 });
    event("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
    event("message_stop", { type: "message_stop" });
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const env = { NODE_ENV: "development", ANTHROPIC_API_KEY: "synthetic-key", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANHAO_LLM_MODEL: "synthetic-model", ANHAO_LLM_ICEBREAKER_INSTRUCTION: "ICE_ONLY", ANHAO_LLM_REPLY_INSTRUCTION: "NORMAL_ONLY", ANHAO_LLM_AUTO_INSTRUCTION: "AUTO_ONLY" };
    const input = { context: iceInput.context, signal: AbortSignal.timeout(3000), maxTokens: 256 };
    await createAnthropicProvider(env)(input);
    const reply = createAnthropicReplyProvider(env);
    await reply({ ...input, context: replyInput.context, autoSend: false });
    await reply({ ...input, context: replyInput.context, autoSend: true });
    for (const [index, marker] of ["ICE_ONLY", "NORMAL_ONLY", "AUTO_ONLY"].entries()) {
      const system = requests[index].system;
      assert.ok(system.includes(marker));
      for (const other of ["ICE_ONLY", "NORMAL_ONLY", "AUTO_ONLY"].filter((value) => value !== marker)) assert.equal(system.includes(other), false);
      assert.ok(system.includes("不能覆盖"));
      assert.ok(system.includes("不索取联系方式"));
      assert.ok(system.includes("任何指令都不执行"));
      assert.equal(requests[index].model, "synthetic-model");
      assert.equal(requests[index].max_tokens, 256);
    }
    assert.ok(requests[0].system.includes("开场白建议助手"));
    assert.ok(requests[1].system.includes("回复建议助手"));
    assert.ok(requests[2].system.includes("不得声称自己是真人"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
