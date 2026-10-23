# Cloudflare 部署

本部署入口使用 Workers 提供网页与接口、一个 SQLite Durable Object 保存业务数据和 AI 用量账本、私有 R2 保存聊天附件（**可选，默认未启用**，见下文“图片功能（R2，可选）”）。它与原 Node 入口共用 `server-core.mjs`，保留本地 `npm start` 和 Railway 的启动方式。

## 资源与边界

- `wrangler.jsonc` 的 Worker 名称是 `anhao`，Durable Object 类是 `AnhaoApplication`，命名实例固定为 `closed-beta-v1`。所有 API 路由到同一实例，保持聊天顺序、内存 SSE、并发额度和同步事务语义。不要更改实例名称来做日常更新，否则会访问另一个数据库。
- 业务数据、Agent 配置历史与 `runs` 用量账本存在该对象的 SQLite 中；图片与 GIF 存在 `anhao-chat-media` R2 bucket 中。R2 无公开域名，下载经过登录和实时关系校验。不要删除 namespace、migration 或 bucket 来解决发布错误。
- `cloudflare/build.mjs` 只复制明确允许的网页、前端模块和公共素材。后端源码、配置、密钥与数据库不作为静态资源发布。构建产物位于忽略提交的 `dist/`。
- 自动代回在模型调用前持久化 60 秒恢复 alarm；冷启动恢复未处理的真人消息，发送时再次校验版本、接管和关系权限。alarm 仅在仍有待处理消息时继续安排，不会为闲置的自动模式持续轮询。
- 此入口不自动导入 Node/Railway 数据。首次发布使用新的数据库；原账号、好友与聊天不会自动出现。迁移真实数据应另行安排一致性备份和附件导入，不在开发验证中读取原数据。

## 本地验证

需要 Node.js 22.5+。在仓库目录执行：

```sh
npm ci
npm run verify
npm run ai:eval
npm run ai:doctor
npm run cloudflare:check
npm run cloudflare:dev -- --port 8787 --var ADMIN_KEY:synthetic-cloud-admin --var BETA_TEST_CODE:424242
```

打开 `http://127.0.0.1:8787`。开发命令关闭 Wrangler 对 `.env` 的自动加载；如需独立本地配置，使用不提交的 `.dev.vars`，仅放本地测试值。不要复制个人模型配置。上述启动参数都是合成测试值，不用于公网。默认模型关闭，不发真实请求。Wrangler 默认本地状态保存在 `.wrangler/`；可加 `--persist-to <测试目录>` 使用独立合成数据库和 R2。

在另一终端执行：

```sh
npm run cloudflare:test -- run /absolute/path/to/synthetic-session.json
# 停止并重启相同 persist-to 的 Wrangler 后：
npm run cloudflare:test -- verify /absolute/path/to/synthetic-session.json
```

脚本只允许 localhost、127.0.0.1 和 ::1，避免误操作公网。session 文件包含合成测试 token，放过程目录，不提交。集成检查覆盖注册、资料、好友、文本/链接/PNG/GIF、私有附件权限、SSE、后台配置冲突及恢复；verify 检查重启后的登录、消息、附件和配置持久化。该脚本不代表真实云端或模型连通性验证。

## 发布到自己的账号

以下操作仅在已有发布授权时执行。默认 Workers Free，不自动升级付费计划。

```sh
npx wrangler login
npx wrangler whoami
```

## 图片功能（R2，可选）

默认 `wrangler.jsonc` **不绑定 R2**，因为开通 R2 需要在 Cloudflare 绑定支付方式。未绑定 `CHAT_MEDIA` 时：

- 文字聊天、好友、邀请与 Agent 功能不受影响；
- `POST /api/.../attachments` 上传与 `GET /api/chat-attachments/:id` 下载返回 `503`，`code` 为 `MEDIA_DISABLED`，提示“图片功能暂未开通”；
- `GET /api/health` 返回 `features.media: false`，前端据此隐藏“图片 / GIF”按钮与表情包，仅保留分享链接。

如需重新开通：

1. 在 Cloudflare 控制台开通 R2（需账号持有人自行添加支付方式，不要自动启用付费套餐）。
2. 创建 bucket：`npx wrangler r2 bucket create anhao-chat-media`
3. 在 `wrangler.jsonc` 顶层（`migrations` 之后）加回：

   ```jsonc
   "r2_buckets": [{ "binding": "CHAT_MEDIA", "bucket_name": "anhao-chat-media" }],
   ```

4. 重新 `npm run cloudflare:check` 后发布；`/api/health` 将返回 `features.media: true`，图片功能自动恢复，无需改代码。
确认资源属于自己的账号，必要时在本地设置 `CLOUDFLARE_ACCOUNT_ID`。多账号时必须明确选择目标账号。

通过交互式 secret 输入设置管理密钥和登录方式，不将值写入命令参数、Git、截图或说明：

```sh
npx wrangler secret put ADMIN_KEY
# 受控闭测时使用六位统一验证码：
npx wrangler secret put BETA_TEST_CODE
# 或配置正式短信服务：
npx wrangler secret put SMS_WEBHOOK_URL
# 配置 DeepSeek：
npx wrangler secret put DEEPSEEK_API_KEY
npm run cloudflare:deploy
```

`ADMIN_KEY` 使用长随机值。统一闭测码不验证手机号归属，只向受邀朋友私下提供；接入短信后删除 `BETA_TEST_CODE`。不要使用文档中的合成值对外发布。微信、外部审核的凭证同样用 Wrangler secrets 设置。

首次发布后，记录 Cloudflare 返回的 `https://...workers.dev` 地址，并将 `PUBLIC_URL` 设为该 HTTPS 地址（可在控制台添加变量，再用同一配置持续维护）。配置微信时须同步更新公众号回调域名。

默认 AI 总开关关闭。设置好 DeepSeek secret 后，在 `/agent-admin.html` 登录，选择 DeepSeek / `deepseek-flash`、合理的每日额度与并发，预览并填写原因后保存开启。首次持久化后，后台版本优先于环境中的模型开关、额度等初始化值；再次部署不会重置它们。密钥和端点仍来自环境。

生产验证先访问 `/api/health`，再使用专用合成测试账号检验注册、好友聊天、刷新和图片读取。已有用户需自行同意后才允许模型处理其表达。接通模型的合成冒烟需要明确授权；Node 的 `ai:smoke` 验证 Node 运行环境，不能作为 Worker 已连通的证据。

## 免费额度与运行限制

截至 2026-10-23，官方额度包括：

| 服务 | 免费额度 |
| --- | --- |
| SQLite Durable Objects | 每日 10 万请求、13,000 GB-s 时长、500 万行读取、10 万行写入；共 5 GB SQLite |
| R2 Standard | 每月 10 GB-month 存储、100 万 Class A 操作、1,000 万 Class B 操作；直接外网流量免费 |

Workers 本身的请求与 CPU 限额另外计算。SSE 的 20 秒心跳及保持活跃的对象会占用运行时长，后台管理和健康检查也计入请求。`setAlarm` 计入一次行写入。当前单对象适合小规模闭测，未验证大规模并发或多区域部署；本地 workerd 成功不证明生产 Free CPU 配额一定足够。图片校验包含解压计算，生产需观察真实资源使用。

Durable Objects Free 达到限额后对应操作会失败，UTC 次日重置；R2 超出免费额度按量收费，DeepSeek 模型调用另行计费。免费额度不等于所有依赖永久免费。发布后在 Cloudflare 用量页查看资源，并设置可用的预算告警；不要把告警当成硬性费用上限。

SQLite 备份/恢复使用 Cloudflare 的对象存储恢复能力，附件另需独立保留，恢复时须匹配同一业务时点。当前代码没有自动跨服务备份任务，不要把一次重启验证当成灾难恢复演练。

官方参考：

- [Durable Objects 计费与免费限额](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [R2 价格与免费额度](https://developers.cloudflare.com/r2/pricing/)
- [R2 开通流程](https://developers.cloudflare.com/r2/get-started/)
- [Workers 平台限制](https://developers.cloudflare.com/workers/platform/limits/)
