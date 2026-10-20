# 暗号：协作约定

暗号是由真实内容和表达驱动的闭测社交产品。当前主入口 `signal-mvp.html`，旧版入口 `index.html` / `app.js` / `styles.css`，服务 `server.mjs`，AI 适配 `llm/`，验证 `test/`。Node.js ≥22.5。

## 开始与交接

- 先读本文件，再运行 `npm run harness -- context`、`npm run harness -- status`，查看当前目标、任务证据和待人工事项；先处理与本任务有关的阻塞，保留已有改动。
- `main` 是唯一长期分支；功能、修复、工程维护与实验分别使用短期 `feat/`、`fix/`、`chore/`、`experiment/` 分支。合并后删除短期分支，旧版用标签归档。规则见 [docs/BRANCHES.md](docs/BRANCHES.md)；commit / push / merge 仍需用户授权。
- 一次做一个可验证的小目标。新任务用 `npm run harness -- new "目标"`；续做用 `show <id>`。任务保存在 `work/harness/tasks/<id>.json`。
- 状态按 `pending → planned → implemented → verified → ready` 推进。`advance <id> planned|implemented|ready --evidence "证据"` 记录相邻阶段；verified 只能由 `check <id>` 检查通过且源码指纹未变时产生。ready 会再次检查指纹；改动后先重跑 check。不要用手写 JSON 或口头声明绕过检查。
- 交接保留任务 ID、改动文件、已执行命令及退出结果、未验证项和待人工事项。ready 只表示可交付审阅，发布由人最终批准。

## 默认执行范围

本地读写、修复、离线测试直接推进。运行 `npm run verify`（语法与测试）、`npm run ai:eval`（离线契约）、`npm run ai:doctor`（安全配置诊断）。检查通过证明覆盖的确定性行为，不代表模型建议的语义质量评分。

发布、部署、删除真实数据和付费批量评测需单独授权；没有这些动作就无需追加审批。不可提交密钥、真实用户数据或凭证输出。测试使用合成数据和临时库，不读取或导出真实业务数据，不批量请求外部 API。

## AI 产品边界

- AI 只在用户明确同意后生成建议草稿，由用户选择是否使用；不得冒充真人、伪造用户或自动发送聊天。
- 将真实用户表达送入模型前须有对该用途及输入来源的明确同意。接通验证可用合成输入；`npm run ai:smoke` 会进行一次真实模型请求，仅在明确要求接通/冒烟时运行，不加入默认验证。
- 复用运行环境现有 `ANTHROPIC_*` 配置；默认模型 `claude-opus-5-5`，兼容路由可用 `ANHAO_LLM_MODEL`。不读出、复制或改写个人配置；不把密钥写进仓库。

## 工作流入口

Orca 的 `orca.yaml` 只配置安装和启动。Claude 会话可用 `/anhao-iterate`、`/anhao-review`；其他 agent 使用同一 npm harness。具体操作与能力限制见 [docs/ORCA.md](docs/ORCA.md)。
