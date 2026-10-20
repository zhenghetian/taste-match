# 在 Orca 中迭代暗号

本仓库提供启动配置、Claude 命令、可显式调用的 Workflow 脚本和通用 npm 任务记录。流程是 Understand → Implement → Verify，每阶段一个 agent 顺序执行；本地任务证据可跨会话、跨 agent 继续。

## 1. 加入现有仓库

在 Orca 选择添加现有本地仓库，指向此项目目录。需要 Node.js ≥22.5。

根目录 `orca.yaml` 配置 `scripts.setup: npm ci`、`setupAgentStartupPolicy: wait-for-setup`，并提供运行 `npm run dev` 的 App 终端页。安装依赖需要网络。打开项目后确认 setup 成功，再启动 App；访问 http://127.0.0.1:4173 。这一步只启动本地应用。

`orca.yaml` 不支持本项目定义原生工作流 DAG。Orca 设置的 Quick Commands → Workflows 可手工添加 repo-scoped 的 terminal-command 或 agent-prompt；当前没有仓库配置导入机制，本仓库不修改个人设置。

## 2. 在 Claude 会话运行

将仓库设为会话工作目录，新开或重启 Claude 会话以发现 `.claude/commands/`，然后输入：

```text
/anhao-iterate 改善暗号提交失败时的提示，保留草稿并提供重试
/anhao-review <任务ID>
```

这是 Claude harness 命令，不是 Orca 原生工作流注册。若菜单未出现，先确认会话目录与命令文件，再新开会话；也可让 agent 读取相应命令文件并按其中步骤执行。

`/anhao-iterate` 在有 Workflow 工具时显式调用 `.claude/workflows/anhao-iterate.js`。脚本本身只是源文件，不会随启动自动执行，也不能用 `node` 运行。工具调用示例（用实际绝对路径替换占位值）：

```js
Workflow({
  scriptPath: "/absolute/path/taste-match-public/.claude/workflows/anhao-iterate.js",
  args: {
    repo: "/absolute/path/taste-match-public",
    task: "改善暗号提交失败时的提示，保留草稿并提供重试"
  }
})
```

只在用户明确要求执行迭代时调用。脚本不指定模型，继承当前会话；应用的 `ANHAO_LLM_MODEL` 不控制工作流 agent。Understand 记录计划，Implement 完成本地修改，Verify 只读审阅并执行离线检查。任一阶段被跳过、失败或阻塞就返回已知进度，不自动循环、不 commit/push/deploy、不建 worktree。`/anhao-review` 同样不修代码；允许测试临时产物与 harness 检查证据写入。

## 3. 其他 agent 或普通终端

Workflow 工具不可用时直接使用 npm；Codex 等 agent 也遵循根目录 `AGENTS.md`。以下命令在仓库目录内执行，`<id>` 替换为 `new` 返回的真实任务 ID：

```bash
npm run harness -- context
npm run harness -- status
npm run harness -- new "改善提交失败提示并保留草稿"
npm run harness -- show <id>
npm run harness -- advance <id> planned --evidence "验收：失败后草稿保留，显示可重试提示；范围为提交表单"
# 完成本地代码改动后
npm run harness -- advance <id> implemented --evidence "记录实际文件和改动行为"
npm run harness -- check <id>
```

任务保存在 `work/harness/tasks/<id>.json`。状态为 `pending → planned → implemented → verified → ready`。`check` 保存退出结果、检查日志与源码指纹，只有检查通过且期间源码未变才会标记 verified；失败会回到 implemented。推进 ready 时再次校验源码指纹，改动后必须重新 check。不要手写任务 JSON 或以口头结论替代检查。续做前先 `show`，不重复推进同一状态；对已完成任务的新改动应另建任务。

完成审阅且没有未解决的阻塞后，可以记录本地交付状态：

```bash
npm run harness -- advance <id> ready --evidence "实际检查结果、验收结论及待人工事项"
```

ready 只表示可交付审阅。最终发布仍由人批准。跨 agent 交接至少提供任务 ID、目标、文件、实际验证结果、未验证项和待人工事项；从 `context`、`status`、`show` 恢复，不依赖上一段聊天记忆。

## 4. 验证与 AI 接通

| 命令 | 实际用途 |
| --- | --- |
| `npm run verify` | 本地语法检查与测试，默认不调用外部模型 |
| `npm run ai:eval` | 合成输入上的离线契约测试；检查格式、边界和失败行为 |
| `npm run ai:doctor` | 安全配置诊断，不打印凭证，不发模型请求 |
| `npm run ai:smoke` | 一次合成输入的真实模型请求；仅明确要求接通/冒烟时执行 |

并非每个任务都需要模型。自动检查通过只能证明已覆盖的确定性行为；离线契约测试与一次 smoke 都不等于语义质量评估。新增付费批量评测要另行确认输入来源、方法和预算。

应用运行时复用现有 `ANTHROPIC_*` 环境，默认模型 `claude-opus-5-5`；兼容网关不支持该模型时，可由环境设置 `ANHAO_LLM_MODEL`，不在仓库硬编码网关别名。先跑 `ai:doctor` 确认配置，不复制个人配置或把密钥写入文件；服务不会自动读取 `.env`，需由终端或运行平台注入环境。

需要本地启动 AI 功能时可运行 `npm run dev:ai`；兼容网关已配置时，该入口可继承环境中的 `ANTHROPIC_DEFAULT_OPUS_MODEL` 作为应用模型。启动服务本身不等于允许上传真实用户表达，仍须在产品内明确同意。Orca 默认 App 页维持 `npm run dev`；在终端使用所需启动命令即可。

产品中的 AI 建议必须由用户明确同意后生成，只作为可编辑草稿，由用户决定使用或发送。真实用户表达不能因开发测试而自动传给模型；测试用合成数据，不制造假用户或自动代聊。
