import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const STATE = join(ROOT, "work/harness");
const TASKS = join(STATE, "tasks");
const command = process.argv[2] || "status";
const args = process.argv.slice(3);
const stamp = () => new Date().toISOString();
const fail = (message) => { throw new Error(message); };
const taskPath = (id) => {
  if (!/^[0-9a-f-]{36}$/.test(id || "")) fail("任务 ID 不合法");
  return join(TASKS, `${id}.json`);
};
const load = (id) => JSON.parse(readFileSync(taskPath(id), "utf8"));
const evidence = () => {
  const at = args.indexOf("--evidence");
  const text = at >= 0 ? args[at + 1]?.trim() : "";
  if (!text) fail("请用 --evidence 提供本阶段交付和验证依据");
  return text;
};
function save(task) {
  mkdirSync(TASKS, { recursive: true });
  task.updatedAt = stamp();
  const path = taskPath(task.id);
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(task, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}
function lock(action) {
  mkdirSync(STATE, { recursive: true });
  const path = join(STATE, "lock");
  try { mkdirSync(path); } catch { fail("另一个 harness 操作仍在运行；若进程已退出，请检查 work/harness/lock 后恢复"); }
  try { return action(); } finally { rmSync(path, { recursive: true }); }
}
const SKIP = new Set([".git", "node_modules", "data", "work", "coverage", ".env", ".env.local"]);
function fingerprint() {
  const hash = createHash("sha256");
  function visit(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".env.") && entry.name !== ".env.example") continue;
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(join(dir, entry.name), `${relative}/`);
      else if (entry.isFile()) { hash.update(relative); hash.update("\0"); hash.update(readFileSync(join(dir, entry.name))); hash.update("\0"); }
    }
  }
  visit(ROOT);
  return hash.digest("hex");
}
function tasks() {
  if (!existsSync(TASKS)) return [];
  return readdirSync(TASKS).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(TASKS, name), "utf8"))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function run() {
  if (command === "status") {
    const rows = tasks();
    console.log(rows.length ? rows.map((t) => `${t.id}  ${t.state}  ${t.goal}`).join("\n") : "暂无任务。npm run harness -- new \"本轮目标\"");
  } else if (command === "context") {
    console.log("先读 AGENTS.md、docs/ORCA.md，再读当前任务。代码和测试是实现事实来源。\n工作流：new → planned → implemented → check → verified → ready。\n状态跨会话保存在 work/harness/；该目录不提交。发布仍需用户明确授权。\n");
    for (const t of tasks().filter((t) => t.state !== "ready")) console.log(JSON.stringify(t, null, 2));
  } else if (command === "new") {
    const goal = args[0]?.trim();
    if (!goal || goal.length > 2000) fail("请提供 1–2000 字的单一目标");
    lock(() => {
      const task = { id: randomUUID(), goal, state: "pending", createdAt: stamp(), history: [], check: null };
      task.history.push({ at: stamp(), state: "pending", evidence: "任务创建，尚未实现或验证" });
      save(task); console.log(JSON.stringify(task, null, 2));
    });
  } else if (command === "show") {
    console.log(JSON.stringify(load(args[0]), null, 2));
  } else if (command === "advance") {
    lock(() => {
      const task = load(args[0]);
      const next = args[1];
      const allowed = { pending: "planned", planned: "implemented", verified: "ready" };
      if (allowed[task.state] !== next) fail(`不能从 ${task.state} 转到 ${next}；verified 必须由 check 成功产生`);
      const note = evidence();
      if (next === "ready" && (!task.check?.passed || task.check.fingerprint !== fingerprint())) fail("验证已失效：代码改变后请重新执行 check");
      task.state = next; task.history.push({ at: stamp(), state: next, evidence: note }); save(task);
      console.log(JSON.stringify(task, null, 2));
    });
  } else if (command === "check") {
    lock(() => {
      const task = load(args[0]);
      if (!["implemented", "verified", "ready"].includes(task.state)) fail("先完成 planned 和 implemented 阶段并记录交付依据");
      const before = fingerprint();
      const result = spawnSync(process.execPath, ["harness/verify.mjs"], {
        cwd: ROOT, env: { ...process.env, ANHAO_LLM_ENABLED: "false" }, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024
      });
      const output = `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${result.error.message}` : ""}`;
      process.stdout.write(output);
      const after = fingerprint();
      const passed = result.status === 0 && before === after;
      const checkId = randomUUID();
      const log = `checks/${checkId}.log`;
      mkdirSync(join(STATE, "checks"), { recursive: true });
      writeFileSync(join(STATE, log), output, { mode: 0o600 });
      task.check = { at: stamp(), passed, fingerprint: after, command: "node harness/verify.mjs", exitCode: result.status, log };
      task.state = passed ? "verified" : "implemented";
      task.history.push({ at: stamp(), state: task.state, evidence: passed ? `离线验证通过；日志 ${log}` : `验证未通过或验证时文件改变；日志 ${log}` });
      save(task);
      console.log(JSON.stringify(task.check, null, 2));
      if (!passed) process.exitCode = 1;
    });
  } else fail("支持：status | context | new <目标> | show <id> | advance <id> <阶段> --evidence <依据> | check <id>");
}
try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
