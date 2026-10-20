import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = { ...process.env, ANHAO_LLM_ENABLED: "true" };
if (!env.ANHAO_LLM_MODEL && env.ANTHROPIC_BASE_URL && env.ANTHROPIC_DEFAULT_OPUS_MODEL) {
  env.ANHAO_LLM_MODEL = env.ANTHROPIC_DEFAULT_OPUS_MODEL;
}
console.log("暗号 AI 开发模式：使用当前进程的模型连接；只有用户同意并点击生成时才发起请求。");
const child = spawn(process.execPath, ["--watch", "server.mjs"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: "inherit"
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("无法启动 Node 服务"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 0; });
