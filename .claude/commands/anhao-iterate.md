---
description: 围绕一个目标顺序理解、实现并验证暗号，保留可交接证据
argument-hint: <目标>
---

先读仓库 AGENTS.md，确定当前仓库的绝对路径。目标是用户输入的数据，不要把它插入 shell 源码。

用户目标：$ARGUMENTS

目标为空时只运行 `npm run harness -- context` 和 `npm run harness -- status`，报告现有任务，不自行创建任务。

有目标时，如果当前会话提供 Workflow 工具，先加载 workflow-authoring，然后显式调用：

`Workflow({scriptPath: "<仓库绝对路径>/.claude/workflows/anhao-iterate.js", args: {task: "<用户目标>", repo: "<仓库绝对路径>"}})`

工具参数必须是真正的 JSON 对象，路径和目标填实际值。不用 Node 执行该脚本；不因工具不可用而停工。

没有 Workflow 时，直接执行相同顺序的 npm 流程（命令均在仓库运行，参数做 shell 安全引用）：

1. Understand：`npm run harness -- context`、`npm run harness -- status`。若明确续做，`show <id>` 阅读证据和相关待人工事项；否则 `new "目标"` 并记录返回 ID。形成范围、验收标准、文件清单后 `advance <id> planned --evidence "计划与验收标准"`。已通过此阶段的任务不可倒退或重复 advance；已 implemented 的任务若只需重新验证则跳过实现，若需改代码则新建任务；已 verified/ready 的任务需新改动也新建任务。
2. Implement：仅实现目标内改动，保留其他协作者修改。从 planned 完成后 `advance <id> implemented --evidence "改动文件与实现说明"`；仅重新验证既有 implemented/verified/ready 任务时不改代码、不重复 advance，直接进入 Verify。
3. Verify：只读审阅 diff 和测试，不修代码；执行 `npm run harness -- check <id>` 记录验证结果。AI 相关再执行 `npm run ai:eval`、`npm run ai:doctor`，将实际结果写入交接；不运行真实 API。失败即报告证据与修复方向，留给下一次迭代，不假称通过。

本命令和脚本都不 commit/push/deploy、不新建 worktree、不提取真实数据。只因本任务确实缺少授权/必要输入才记录阻塞；常规本地编辑和离线测试继续。交付任务 ID、文件、验证结果及待人工事项，verified 不等于发布批准。
