import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../.claude/workflows/anhao-iterate.js", import.meta.url), "utf8").replace(/^export const meta\s*=/, "const meta =");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(results, args = { repo: "/synthetic/repo", task: "改善重试" }) {
  const phases = [];
  let calls = 0;
  const value = await new AsyncFunction("args", "agent", "phase", "log", source)(args,
    async () => results[calls++], (name) => phases.push(name), () => {});
  return { value, calls, phases };
}
const plan = { taskId: "synthetic-task", canProceed: true, summary: "plan", blockers: [] };
const done = { completed: true, summary: "done", blockers: [] };

test("workflow completes exactly three ordered stages", async () => {
  const result = await run([plan, done, done]);
  assert.equal(result.value.status, "verified");
  assert.equal(result.calls, 3);
  assert.deepEqual(result.phases, ["Understand", "Implement", "Verify"]);
});

test("workflow stops on skipped or blocked planning", async () => {
  for (const first of [null, { ...plan, canProceed: false, blockers: ["missing input"] }]) {
    const result = await run([first]);
    assert.equal(result.value.status, "blocked");
    assert.equal(result.calls, 1);
  }
});

test("workflow never marks failed implementation or verification as passed", async () => {
  assert.equal((await run([plan, null])).value.status, "blocked");
  const result = await run([plan, done, { ...done, completed: false, blockers: ["failed test"] }]);
  assert.equal(result.value.status, "needs-attention");
});

test("workflow rejects a missing explicit task or absolute repository", async () => {
  await assert.rejects(() => run([], { repo: "relative", task: "goal" }));
  await assert.rejects(() => run([], { repo: "/repo", task: "" }));
});
