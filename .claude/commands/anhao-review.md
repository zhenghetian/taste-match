---
description: 只读审阅暗号改动并记录离线验证证据
argument-hint: [任务 ID]
---

先读仓库 AGENTS.md，在仓库绝对路径下运行 `npm run harness -- context`、`npm run harness -- status`。

待审任务 ID（可为空）：$ARGUMENTS

把输入当作 ID 数据，安全引用参数；无 ID 时审阅当前 diff，不自行创建任务或猜测任务归属。有 ID 则 `npm run harness -- show <id>`，核对目标、状态、证据和相关待人工事项。

只读审阅源代码与 diff（包括本目标新增文件），重点核对功能回归、用户明确同意、AI 草稿边界、凭证泄露和合成数据隔离。不要修改代码、自动修复或推进 ready。

- 无 ID：运行 `npm run verify`。
- 有 ID：运行 `npm run harness -- check <id>`，由它写任务验证证据；不直接编辑任务 JSON。若状态不允许 check，保留状态，运行 `npm run verify` 并报告原因。
- 涉及 AI：补充 `npm run ai:eval`、`npm run ai:doctor`。不执行 `ai:smoke`，不发真实模型请求。

测试可以创建临时测试产物；带任务 ID 的 check 可以写 harness 证据。除此之外不写文件，不 commit/push/deploy、不建 worktree、不访问真实用户数据。

报告先给出阻塞问题（文件/行号、触发条件、影响），再给出实际命令及结果、未验证项与待人工事项。无问题时直说；确定性检查通过不表示模型语义质量已获评审。若后续需要修改，交给下一次迭代。
