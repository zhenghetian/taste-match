# 暗号 Claude 会话

先读 [AGENTS.md](AGENTS.md)，它是本仓库的协作与数据边界约定。

- `/anhao-iterate <目标>`：Understand → Implement → Verify，每阶段一个 agent 顺序执行，保留 npm harness 任务证据。
- `/anhao-review [任务 ID]`：只读审阅与离线验证，报告阻塞和待人工事项。
- `.claude/workflows/anhao-iterate.js` 是 Claude `Workflow` 工具脚本；仅显式工具调用运行，不用 Node 执行。工具不可用时按命令中的 npm 流程继续。
- 新增命令需在仓库中新开/重启 Claude 会话后发现。它们不是 Orca 原生工作流注册。

本地修改与离线验证直接完成；交付时给出任务 ID、文件、实际验证结果和待人工事项。不要自动 commit、push、deploy 或新建 worktree。
