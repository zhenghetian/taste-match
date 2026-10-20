import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createIcebreakerHarness } from "../llm/icebreaker.mjs";

const action = process.argv[2] || "doctor";
const env = process.env;
if (action === "doctor") {
  let host = "api.anthropic.com";
  let validEndpoint = true;
  try { if (env.ANTHROPIC_BASE_URL) host = new URL(env.ANTHROPIC_BASE_URL).hostname; } catch { validEndpoint = false; }
  console.log(JSON.stringify({
    enabled: env.ANHAO_LLM_ENABLED === "true",
    model: env.ANHAO_LLM_MODEL || "claude-opus-5-5",
    endpointHost: validEndpoint ? host : "invalid-url",
    credentialPresent: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    note: "仅检查配置，不发请求、不显示密钥。OAuth profile 凭据可能由 SDK 自动解析。当前 Orca 的模型别名不会自动成为产品模型；兼容路由请显式设置 ANHAO_LLM_MODEL。"
  }, null, 2));
  if (!validEndpoint) process.exitCode = 1;
} else if (action === "eval") {
  const result = spawnSync(process.execPath, ["--test", "test/ai-harness.test.mjs"], { stdio: "inherit" });
  process.exitCode = result.status === 0 ? 0 : 1;
} else if (action === "smoke") {
  const dir = mkdtempSync(join(tmpdir(), "anhao-ai-smoke-"));
  const harness = createIcebreakerHarness({ env: { ...env, ANHAO_LLM_ENABLED: "true", DATA_DIR: dir, ANHAO_LLM_DAILY_LIMIT: "1" } });
  try {
    const result = await harness.suggest({ actorId: "synthetic-smoke", echoId: "synthetic-echo", context: {
      title: "下班后在公园散步", reaction: "我喜欢没有安排的傍晚", question: "你喜欢怎样度过一个安静的晚上？"
    } });
    console.log(JSON.stringify(result, null, 2));
    if (result.source !== "model") process.exitCode = 1;
  } finally { harness.close(); rmSync(dir, { recursive: true, force: true }); }
} else { console.error("支持 doctor | eval | smoke"); process.exitCode = 1; }
