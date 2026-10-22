import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { inspectAIConfig, resolveModel, anthropicOptions, thinkingOptions, useServerFallbacks } from "../llm/config.mjs";
import { createAnthropicProvider } from "../llm/icebreaker.mjs";
import { createAnthropicReplyProvider } from "../llm/reply-draft.mjs";
import { smokeAI } from "../harness/ai.mjs";

const cloudEnv = { NODE_ENV: "production", ANHAO_LLM_ENABLED: "true", ANTHROPIC_API_KEY: "synthetic-key" };

test("cloud config rejects local and insecure endpoints, accepts independent HTTPS", () => {
  for (const endpoint of ["http://127.0.0.1:9000", "https://localhost", "https://10.1.2.3", "https://192.168.1.2", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://[fd00::1]", "http://gateway.example"]) {
    const config = inspectAIConfig({ ...cloudEnv, ANTHROPIC_BASE_URL: endpoint });
    assert.equal(config.configurationValid, false, endpoint);
  }
  for (const endpoint of ["ftp://gateway.example", "not-a-url", "https://user:password@gateway.example", "https://gateway.example?key=secret"]) {
    assert.deepEqual(inspectAIConfig({ ...cloudEnv, ANTHROPIC_BASE_URL: endpoint }).issues, ["invalid_endpoint"]);
  }
  const valid = inspectAIConfig({ ...cloudEnv, ANTHROPIC_BASE_URL: "https://gateway.example/api" });
  assert.equal(valid.configurationValid, true);
  assert.equal(valid.connectionVerified, false);
  assert.equal(inspectAIConfig({ NODE_ENV: "production" }).issues.includes("missing_cloud_credential"), true);
});

test("model resolution is shared by development and production", () => {
  assert.equal(resolveModel({}), "claude-opus-5-5");
  assert.equal(resolveModel({ ANTHROPIC_DEFAULT_OPUS_MODEL: "unused-alias" }), "claude-opus-5-5");
  const env = { ANTHROPIC_BASE_URL: "https://gateway.example", ANTHROPIC_DEFAULT_OPUS_MODEL: "gateway-opus" };
  assert.equal(resolveModel(env), "gateway-opus");
  assert.equal(resolveModel({ ...env, ANHAO_LLM_MODEL: "explicit-model" }), "explicit-model");
  assert.throws(() => anthropicOptions({ ...cloudEnv, ANTHROPIC_BASE_URL: "http://localhost" }), /invalid_configuration/);
});

test("DeepSeek isolates its public endpoint, key and model from inherited desktop configuration", () => {
  const env = { ...cloudEnv, ANHAO_LLM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "synthetic-deepseek", ANTHROPIC_BASE_URL: "http://localhost:9000", ANTHROPIC_AUTH_TOKEN: "desktop-token", ANTHROPIC_DEFAULT_OPUS_MODEL: "desktop-alias", ANHAO_LLM_SERVER_FALLBACKS: "true" };
  const config = inspectAIConfig(env);
  assert.equal(config.provider, "deepseek");
  assert.equal(config.configurationValid, true);
  assert.equal(config.endpointHost, "api.deepseek.com");
  assert.equal(config.model, "deepseek-flash");
  assert.deepEqual(anthropicOptions(env), { maxRetries: 0, baseURL: "https://api.deepseek.com/anthropic", apiKey: "synthetic-deepseek", authToken: null });
  assert.deepEqual(thinkingOptions(env), { thinking: { type: "disabled" } });
  assert.equal(useServerFallbacks(env), false);
  assert.equal(resolveModel({ ...env, ANHAO_LLM_MODEL: "deepseek-v4-pro" }), "deepseek-v4-pro");
  assert.equal(inspectAIConfig({ ...env, DEEPSEEK_API_KEY: "" }).credentialPresent, false);
  assert.equal(inspectAIConfig({ ANHAO_LLM_PROVIDER: "unknown" }).configurationValid, false);
});

test("official SDK uses supplied endpoint, credential, model and distinct auto prompt", async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    requests.push({ input, authorization: req.headers.authorization, apiKey: req.headers["x-api-key"] });
    const output = input.system.includes("开场白") ? { suggestions: ["你留意到什么？", "想说说这次散步吗？", "你喜欢哪里的风景？"] } : { draft: "愿意说说你留意到的风景吗？" };
    res.writeHead(200, { "content-type": "text/event-stream" });
    const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    event("message_start", { type: "message_start", message: { id: "msg_synthetic", type: "message", role: "assistant", model: "synthetic-opus", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } });
    event("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    event("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(output) } });
    event("content_block_stop", { type: "content_block_stop", index: 0 });
    event("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
    event("message_stop", { type: "message_stop" });
    res.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const env = { NODE_ENV: "development", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_AUTH_TOKEN: "synthetic-token", ANHAO_LLM_MODEL: "synthetic-opus" };
    const icebreaker = createAnthropicProvider(env), reply = createAnthropicReplyProvider(env);
    const input = { context: { title: "公园", reaction: "散步", question: "你看见什么？" }, signal: AbortSignal.timeout(3000), maxTokens: 1024 };
    await icebreaker(input); await reply({ ...input, autoSend: false }); await reply({ ...input, autoSend: true });
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.authorization, "Bearer synthetic-token");
      assert.equal(request.apiKey, undefined);
      assert.equal(request.input.model, "synthetic-opus");
      assert.equal(request.input.stream, true);
      assert.equal(request.input.fallbacks, undefined);
    }
    assert.ok(requests[1].input.system.includes("回复建议助手"));
    assert.ok(requests[2].input.system.includes("Agent 代回"));
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("smoke checks all features without sending messages or printing generated content", async () => {
  const modes = [];
  const result = await smokeAI({ env: {}, all: true,
    icebreakerProvider: async () => ({ output: { suggestions: ["甲", "乙", "丙"] } }),
    replyProvider: async ({ autoSend }) => { modes.push(autoSend); return { output: { draft: "合成验证回复" } }; }
  });
  assert.equal(result.passed, true);
  assert.deepEqual(modes, [false, true]);
  assert.equal(result.checks.length, 3);
  assert.equal(result.messagesSent, 0);
  assert.equal(JSON.stringify(result).includes("合成验证回复"), false);
  const failure = await smokeAI({ env: {}, icebreakerProvider: async () => { throw Object.assign(new Error("secret-provider-error"), { status: 401 }); } });
  assert.equal(failure.passed, false);
  assert.equal(failure.checks[0].reason, "authentication");
  assert.equal(JSON.stringify(failure).includes("secret-provider-error"), false);
});

test("cloud doctor fails without a standalone credential and keeps secrets out of output", () => {
  const result = spawnSync(process.execPath, ["harness/ai.mjs", "doctor", "--cloud"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
    env: { ...process.env, ANHAO_LLM_ENABLED: "true", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", ANTHROPIC_BASE_URL: "https://gateway.example" }
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.ok(report.issues.includes("missing_cloud_credential"));
  assert.equal(report.connectionVerified, false);
  const blocked = spawnSync(process.execPath, ["harness/ai.mjs", "smoke", "--all", "--cloud"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
    env: { ...process.env, ANTHROPIC_AUTH_TOKEN: "must-not-leak", ANTHROPIC_BASE_URL: "http://127.0.0.1:1" }
  });
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).requestsMade, 0);
  assert.equal((blocked.stdout + blocked.stderr).includes("must-not-leak"), false);
});
