import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inspectAIConfig } from "../llm/config.mjs";
import { createIcebreakerHarness } from "../llm/icebreaker.mjs";
import { createReplyDraftHarness } from "../llm/reply-draft.mjs";

export async function smokeAI({ env = process.env, all = false, icebreakerProvider, replyProvider } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "anhao-ai-smoke-"));
  const testEnv = { ...env, ANHAO_LLM_ENABLED: "true", DATA_DIR: dir, ANHAO_LLM_DAILY_LIMIT: all ? "3" : "1", ANHAO_LLM_USER_DAILY_LIMIT: "3" };
  const icebreaker = createIcebreakerHarness({ env: testEnv, provider: icebreakerProvider });
  const replies = createReplyDraftHarness({ env: testEnv, provider: replyProvider });
  const checks = [];
  const summary = (feature, result) => ({ feature, source: result.source, reason: result.reason || null, passed: result.source === "model" });
  try {
    checks.push(summary("icebreakers", await icebreaker.suggest({ actorId: "synthetic-smoke", echoId: "synthetic-echo", context: {
      title: "下班后在公园散步", reaction: "我喜欢没有安排的傍晚", question: "你喜欢怎样度过一个安静的晚上？"
    } })));
    if (all) {
      for (const autoSend of [false, true]) {
        checks.push(summary(autoSend ? "auto_reply" : "reply_draft", await replies.suggest({
          actorId: "synthetic-smoke", threadKey: "synthetic-thread", autoSend,
          context: { title: "公园散步", reaction: "愿意聊聊安静的傍晚", recentMessages: [{ role: "other", text: "散步时你更喜欢留意什么？" }] }
        })));
      }
    }
    return { passed: checks.every((check) => check.passed), provider: inspectAIConfig(env).provider, model: inspectAIConfig(env).model, synthetic: true, messagesSent: 0, checks };
  } finally {
    icebreaker.close(); replies.close(); rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const action = process.argv[2] || "doctor";
  const env = process.env;
  if (action === "doctor") {
    const config = inspectAIConfig(env, { cloud: process.argv.includes("--cloud") || env.NODE_ENV === "production" });
    console.log(JSON.stringify({ ...config, note: "仅检查配置，不发请求、不显示密钥。connectionVerified=false 表示本检查未验证连通性。云端需要独立的 HTTPS 模型服务与环境凭证，不能使用本机代理。" }, null, 2));
    if (!config.configurationValid || (config.cloud && !config.enabled)) process.exitCode = 1;
  } else if (action === "eval") {
    const result = spawnSync(process.execPath, ["--test", "test/ai-harness.test.mjs"], { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit" });
    process.exitCode = result.status === 0 ? 0 : 1;
  } else if (action === "smoke") {
    const cloud = process.argv.includes("--cloud") || env.NODE_ENV === "production";
    const config = inspectAIConfig(env, { cloud });
    if (!config.configurationValid) {
      console.log(JSON.stringify({ passed: false, requestsMade: 0, issues: config.issues }, null, 2));
      process.exitCode = 1;
      return;
    }
    const result = await smokeAI({ env: { ...env, ...(cloud ? { NODE_ENV: "production" } : {}) }, all: process.argv.includes("--all") });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } else { console.error("支持 doctor [--cloud] | eval | smoke [--all] [--cloud]"); process.exitCode = 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => { console.error("AI 检查未完成，请检查配置与运行环境；详细错误不输出以避免泄露凭证。"); process.exitCode = 1; });
}
