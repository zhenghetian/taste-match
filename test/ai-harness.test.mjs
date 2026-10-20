import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createIcebreakerHarness, validateSuggestions } from "../llm/icebreaker.mjs";

const input = { actorId: "test-user", echoId: "test-echo", context: { title: "夜里的散步", reaction: "我喜欢慢慢走", question: "你喜欢怎样的傍晚？" } };
const output = { suggestions: ["你散步的时候，会留意路边的什么？", "你更喜欢一个人走，还是和朋友一起？", "你有一条经常走的小路吗？"] };
function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "anhao-ai-test-"));
  const env = { ANHAO_LLM_ENABLED: "true", DATA_DIR: dir, ...options.env };
  const harness = createIcebreakerHarness({ ...options, env });
  t.after(() => { harness.close(); rmSync(dir, { recursive: true, force: true }); });
  return { harness, env, dir };
}

test("disabled harness never calls a provider", async (t) => {
  const { harness } = fixture(t, { env: { ANHAO_LLM_ENABLED: "false" }, provider: () => assert.fail("network must not run") });
  assert.equal((await harness.suggest(input)).reason, "disabled");
});

test("provider receives only allowed context; ledger contains metadata only", async (t) => {
  let seen;
  const records = [];
  const { harness, dir } = fixture(t, { provider: async (request) => { seen = request; return { output, usage: { input_tokens: 120, output_tokens: 60 }, model: "test-model" }; }, record: (value) => records.push(value) });
  const result = await harness.suggest({ ...input, context: { ...input.context, phone: "private", chat: "private" } });
  assert.equal(result.source, "model");
  assert.deepEqual(seen.context, input.context);
  assert.ok(seen.signal instanceof AbortSignal);
  assert.equal(records[0].inputTokens, 120);
  const db = new DatabaseSync(join(dir, "ai-harness.db"), { readOnly: true });
  const row = db.prepare("SELECT * FROM runs").get();
  db.close();
  assert.equal(row.status, "model");
  assert.equal(row.prompt_version, "icebreaker-v1");
  const serialized = JSON.stringify(row);
  for (const text of [input.actorId, input.context.reaction, input.context.title, output.suggestions[0]]) assert.equal(serialized.includes(text), false);
});

test("daily reservation persists across harness restarts and counts failed calls", async (t) => {
  let calls = 0;
  const { harness, env } = fixture(t, { env: { ANHAO_LLM_DAILY_LIMIT: "1" }, provider: async () => { calls += 1; throw new Error("provider unavailable"); } });
  assert.equal((await harness.suggest(input)).source, "fallback");
  const restarted = createIcebreakerHarness({ env, provider: async () => { calls += 1; return { output }; } });
  t.after(() => restarted.close());
  assert.equal((await restarted.suggest(input)).reason, "daily_limit");
  assert.equal(calls, 1);
});

test("per user quota does not prevent another user from trying", async (t) => {
  const { harness } = fixture(t, { env: { ANHAO_LLM_USER_DAILY_LIMIT: "1" }, provider: async () => ({ output }) });
  assert.equal((await harness.suggest(input)).source, "model");
  assert.equal((await harness.suggest(input)).reason, "daily_limit");
  assert.equal((await harness.suggest({ ...input, actorId: "second-user" })).source, "model");
});

test("malformed or unsafe output falls back without producing messages", async (t) => {
  const { harness } = fixture(t, { provider: async () => ({ output: { suggestions: ["加我微信 13800138000", "你好", "你好"] } }) });
  const result = await harness.suggest(input);
  assert.equal(result.source, "fallback");
  assert.equal(result.reason, "invalid_output");
  assert.equal(result.suggestions.length, 3);
  assert.throws(() => validateSuggestions({ suggestions: ["<script>", "b", "c"] }));
});

test("overlong context is rejected rather than silently truncated", async (t) => {
  const { harness } = fixture(t, { provider: () => assert.fail("invalid context must not reach provider") });
  assert.equal((await harness.suggest({ ...input, context: { ...input.context, title: "a".repeat(201) } })).reason, "invalid_context");
});

test("timeouts abort provider requests and release concurrency", async (t) => {
  let signal;
  const { harness } = fixture(t, { env: { ANHAO_LLM_TIMEOUT_MS: "20" }, provider: async (request) => { signal = request.signal; return new Promise(() => {}); } });
  const result = await harness.suggest(input);
  assert.equal(result.reason, "timeout");
  assert.equal(signal.aborted, true);
});

test("concurrency gate prevents an additional provider call", async (t) => {
  let finish;
  const { harness } = fixture(t, { env: { ANHAO_LLM_CONCURRENCY: "1" }, provider: () => new Promise((resolve) => { finish = resolve; }) });
  const first = harness.suggest(input);
  assert.equal((await harness.suggest({ ...input, actorId: "other" })).reason, "busy");
  finish({ output });
  assert.equal((await first).source, "model");
});
