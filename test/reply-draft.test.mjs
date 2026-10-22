import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReplyDraftHarness, validateDraft, contextForReplyModel, REPLY_PROMPT_VERSION } from "../llm/reply-draft.mjs";

const input = {
  actorId: "test-user",
  threadKey: "echo:test",
  context: {
    title: "夜里的散步",
    reaction: "我喜欢慢慢走",
    recentMessages: [
      { role: "other", text: "这很像我" },
      { role: "me", text: "是啊，我也会多走一站" }
    ]
  }
};
const output = { draft: "你散步的时候，通常会想些什么？" };

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "anhao-reply-"));
  const env = { ANHAO_LLM_ENABLED: "true", DATA_DIR: dir, ...options.env };
  const harness = createReplyDraftHarness({ ...options, env });
  t.after(() => { harness.close(); rmSync(dir, { recursive: true, force: true }); });
  return { harness, env, dir };
}

test("reply draft disabled harness never calls provider", async (t) => {
  const { harness } = fixture(t, { env: { ANHAO_LLM_ENABLED: "false" }, provider: () => assert.fail("network") });
  assert.equal((await harness.suggest(input)).reason, "disabled");
  assert.ok((await harness.suggest(input)).draft);
});

test("reply draft validates context and output", async (t) => {
  assert.throws(() => contextForReplyModel({ title: "a", reaction: "b", recentMessages: [{ role: "x", text: "hi" }] }));
  assert.throws(() => validateDraft({ draft: "加我微信" }));
  const { harness } = fixture(t, { provider: async () => ({ output, usage: { input_tokens: 10, output_tokens: 5 }, model: "test" }) });
  const result = await harness.suggest(input);
  assert.equal(result.source, "model");
  assert.equal(result.draft, output.draft);
  assert.equal(harness.status().promptVersion, REPLY_PROMPT_VERSION);
  assert.equal(harness.status().autoSend, false);
});

test("reply draft falls back on unsafe model output", async (t) => {
  const { harness } = fixture(t, { provider: async () => ({ output: { draft: "加我微信 13800138000" } }) });
  const result = await harness.suggest(input);
  assert.equal(result.source, "fallback");
  assert.equal(result.reason, "invalid_output");
});

test("reply draft passes few-shot style examples and summary to provider", async (t) => {
  let seen;
  const { harness } = fixture(t, { provider: async ({ context }) => { seen = context; return { output, usage: {}, model: "test" }; } });
  const styleExamples = Array.from({ length: 12 }, (_, i) => ({ suggestion: "你平时散步的时候，一般都会想些什么事情呢？", final: `哈哈你散步想啥呀${i}？`, edited: true }));
  await harness.suggest({ ...input, context: { ...input.context, styleExamples } });
  assert.equal(seen.styleExamples.length, 8);
  assert.match(seen.styleSummary, /更短/);
  assert.match(seen.styleSummary, /语气词/);
  const plain = contextForReplyModel(input.context);
  assert.equal(plain.styleExamples, undefined);
});
