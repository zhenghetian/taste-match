# 公网部署

暗号需要一个 Node.js 22.5+ 进程、HTTPS 和一块持久化磁盘。GitHub Pages 只能托管旧静态页面，不能运行登录、好友、聊天或 Agent 代回。

## 单实例与数据

- 数据库是 `DATA_DIR/anhao.db`，模型用量账本是同目录的 `ai-harness.db`，均使用 SQLite WAL。
- 聊天图片与表情包保存在 `DATA_DIR/chat-media/`，必须与数据库一起持久化和备份；恢复时需保持附件记录与文件一致。当前每张最多 3MB，每用户最多 24MB，全库最多 256MB；达到配额会拒绝新上传。超过 24 小时未发送的附件在服务启动和下次上传时清理。
- Railway 挂载持久化磁盘到 `/data`，并设置 `DATA_DIR=/data`。容器重启或重新部署不得更换或清空这块磁盘。
- 只运行一个副本。实时连接保存在当前进程，多个副本不会共享新消息通知。
- 反向代理必须支持 `GET /api/events` 的长连接并关闭响应缓冲；服务已发送 `X-Accel-Buffering: no`。健康检查路径是 `/api/health`。
- 生产默认监听 `0.0.0.0`，端口使用平台注入的 `PORT`。

## 登录

- 正式公开使用必须配置 `SMS_WEBHOOK_URL`。服务会向该地址 POST `{ "phone": "...", "code": "..." }`，只有返回 2xx 才视为发送成功。
- `BETA_TEST_CODE` 是所有手机号共用的 6 位固定验证码。它不证明手机号归属，知道验证码的人可以注册任意号码，也能登录已有号码；只适合受控内测，接入短信后必须删除。
- 微信登录需要同时配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和 `PUBLIC_URL`，并在微信后台登记 `${PUBLIC_URL}/api/auth/wechat/callback`。
- 生产环境必须设置长随机 `ADMIN_KEY`，访问 `/admin.html` 时使用它。不要设置 `DEMO_MATCHING_ENABLED=true`。

## 模型

模型默认关闭。模型调用由 Node 后端执行，部署到 Railway 后不需要电脑或 Orca 保持开启。云端必须连接独立运行的 HTTPS 模型服务；电脑上的 localhost 代理不能用于这一用途，生产 provider 会拒绝本机、内网 IP 和非 HTTPS 地址。域名检查不代替网络连通性验证。

在 Railway 的 `anhao-web` → Variables 中配置以下一种连接方式：

- DeepSeek：设置 `ANHAO_LLM_PROVIDER=deepseek` 和 `DEEPSEEK_API_KEY`；默认模型为 `deepseek-flash`，可用 `ANHAO_LLM_MODEL` 显式选择。后端通过官方 Anthropic 兼容端点 `https://api.deepseek.com/anthropic` 直连，使用现有 `@anthropic-ai/sdk`，不新增 SDK。忽略本机继承的 `ANTHROPIC_*` 地址、凭证和模型别名；不启用 Anthropic 专属拒答回退。聊天短回复使用 DeepSeek 官方支持的非思考模式，保留流式响应、20 秒超时、输出校验及现有额度。参考 [官方接口文档](https://api-docs.deepseek.com/guides/anthropic_api)。
- Anthropic 官方 API：设置 `ANHAO_LLM_PROVIDER=anthropic` 与独立的 `ANTHROPIC_API_KEY`，`ANTHROPIC_BASE_URL` 不填；模型默认 `claude-opus-5-5`。
- 兼容网关：设置公网 HTTPS `ANTHROPIC_BASE_URL`、该服务的 `ANTHROPIC_AUTH_TOKEN`（或 API key）及 `ANHAO_LLM_MODEL`。不能使用本机代理地址或依赖桌面登录的临时连接。

以上方式都需要 `ANHAO_LLM_ENABLED=true`、`DATA_DIR=/data`。默认全局每天 100 次、每用户每天 10 次，开场语与回复共用持久化账本。密钥在平台安全设置中输入，不放入 Git、终端参数、截图或文档；不要把本机个人配置文件复制到云端。

模型解析顺序统一为显式 `ANHAO_LLM_MODEL` → 配置网关时的 `ANTHROPIC_DEFAULT_OPUS_MODEL` → 默认模型。`npm start`、`dev:ai`、诊断与冒烟使用相同规则。官方接口默认启用拒答回退；兼容网关默认关闭，维持原有行为。

在实际部署容器中执行以下检查，不能用本机成功来代替云端验证：

```bash
npm run ai:doctor -- --cloud
npm run ai:smoke -- --all --cloud
```

`doctor` 不发请求，检查开关、HTTPS 地址和云端环境凭证；配置错误或模型未开启时退出非零。它会拒绝仅本地可用的连接。配置有效不表示连通成功。

`smoke --all` 最多发起 3 次合成输入的真实模型请求，分别检查开场白、建议草稿和自动代回提示词；使用临时用量账本，结束即删除，不读业务聊天、不发送消息。仅全部结果来自模型且通过输出校验才成功；备用内容视为失败。输出只含通过状态与脱敏原因，不输出密钥或生成正文。它验证模型链路，不代表回复质量评分或完整聊天 UI 验收。

`GET /api/ai/status` 需登录，返回功能开关、静态配置状态与原因码，不返回密钥或端点。`connectionVerified:false` 表示这个状态接口本身没有进行实时网络验证；以冒烟命令的实际结果作为接通证据。

## 发布前检查

1. 部署成功后访问 `https://<域名>/api/health`，确认返回 `{"ok":true}`。
2. 使用真实手机号完成验证码注册、资料填写、生成好友码和加入好友。
3. 双方发送一条消息，确认刷新后仍然存在。
4. 打开自动代回前确认模型配置和每日额度；失败应停止代回，不发送备用内容。
5. 配置数据库所在磁盘的定期备份，并保留恢复演练记录。
