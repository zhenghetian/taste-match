import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "data", "work", ".claude"].includes(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) walk(path);
    else if (/\.(?:mjs|js)$/.test(item.name)) files.push(path);
    else if (item.name.endsWith(".html")) {
      const html = readFileSync(path, "utf8");
      let n = 0;
      for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/.test(script[1]) || /type\s*=\s*["'](?:text\/babel|application\/(?:ld\+)?json)["']/i.test(script[1])) continue;
        n += 1;
        // Inline module imports are checked as modules by Node below only in standalone files.
        const source = script[2].replace(/^\s*import\s.+?;\s*$/gm, "");
        new vm.Script(source, { filename: `${path}:inline-${n}` });
      }
    }
  }
}
try {
  walk(root);
  for (const path of files) {
    const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${path}`);
  }
  const workflowDir = join(root, ".claude/workflows");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const name of readdirSync(workflowDir).filter((name) => name.endsWith(".js"))) {
    const source = readFileSync(join(workflowDir, name), "utf8").replace(/^export const meta\s*=/, "const meta =");
    new AsyncFunction("args", "agent", "phase", "log", source);
  }
  console.log(`JavaScript syntax: ${files.length} files, inline scripts and workflow scripts passed`);
  const tests = readdirSync(join(root, "test")).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => `test/${name}`);
  const result = spawnSync(process.execPath, ["--test", ...tests], {
    cwd: root, env: { ...process.env, ANHAO_LLM_ENABLED: "false" }, stdio: "inherit", timeout: 110000
  });
  process.exitCode = result.status === 0 ? 0 : 1;
} catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
