# 分支与版本管理

## 唯一长期分支

`main` 是最新版的唯一来源，包含暗号实验 MVP、AI 开场白和 Orca / Harness 工程。产品入口为 `/`（`signal-mvp.html`）。

日常开发从最新 `main` 创建一个短期分支，一个分支只处理一个可验证目标：

- `feat/<目标>`：新功能。
- `fix/<问题>`：缺陷修复。
- `chore/<事项>`：依赖、文档、工程维护。
- `experiment/<假设>`：有明确验收和结束条件的实验。

提交后通过 PR 合入 `main`，合并前运行 `npm run verify` 并检查 CI。只有用户明确授权时才 commit / push / merge；通常任务默认停在本地验证。合并后删除对应的本地与远端短期分支。无需长期维护 `develop`、`dev` 或第二条产品主线。

## 历史归档

2026-10-20 整合使用以下归档标签。标签固定旧提交，保留历史但不作为日常开发分支：

| 标签 | 提交 | 含义 |
| --- | --- | --- |
| `archive/main-before-consolidation-2026-10-20` | `e9e134d5a8d4721c1df9e785314b518c00540142` | 整合前的 main，全屏内容与痕迹流程 |
| `archive/signal-mvp-2026-10-20` | `cdca5a2b66ebff607db79c6bff737a25d4d48f33` | 实验分支最终版本，尚未接入 AI / Harness |
| `archive/gh-pages-2026-10-20` | `e11947df2b00e098fbc87553c220058be7508a35` | 早期静态展示分支 |

旧分支 `experiment/signal-conversation-mvp`、`gh-pages` 和本地 `feat/orca-workflows-harness` 在整合完成后删除。实验分支历史通过快进完整进入 `main`，无强制推送或历史改写。

查看旧版本时可从标签创建临时分支，例如：

```bash
git switch -c experiment/revisit-signal archive/signal-mvp-2026-10-20
```

先确保当前改动已妥善保存；不要为查看旧版覆盖工作目录或真实数据库。

## 保留的界面入口

目前不删除旧界面代码和资源，便于继续比较产品方向：

- `/`：最新版，暗号 → 回声 → 对话，含用户主动选择的 AI 草稿。
- `/index.html`：旧 main 界面，发现 → 相遇 → 对话。
- `/ia-prototype.html`：早期同频 / AI 画像的演示原型。
- `/echo-prototype.html`：回声概念的演示原型。

这些入口在同一工程内，不需要各自维护一个长期分支。原型演示数据不代表真实用户或匹配结果。

## 验证与发布

GitHub Actions 在推送 `main`、提交 PR 或手动触发时安装锁定依赖并运行 `npm run verify`。测试使用临时数据、禁用真实模型请求，不配置模型密钥；CI 只验证，不部署。

当前应用需要 Node 服务和持久化数据库，GitHub Pages 不能承载完整产品。Pages 使用 GitHub Actions 发布模式；仓库不提供自动部署工作流，因此代码推送不触发旧的 Pages 自动发布。已有静态站点与产品后端不是同一服务。

正式发布时才创建 `vX.Y.Z` 标签，并另行确认部署平台、配置、数据迁移与回退方式。归档标签不代表正式发布。
