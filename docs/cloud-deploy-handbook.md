# AI Employee V1 · 云端部署备忘总纲

本文是 **部署总入口**：职责边界、monorepo 在平台上的根目录、常见现象与自检命令。细节与分册见文末 **配套文档**（不替代各专题文档）。

---

## 一、架构总览

```text
Telegram
  → Railway bot-service
  → Railway orchestrator-service
      ├─ GRSAI（模型）
      ├─ Supabase（账本）
      └─ Vercel admin-web（管理台）
```

---

## 二、Railway（双服务 · monorepo）

### 2.1 构建失败时（与变量无关）

出现 **`Error creating build plan with Railpack`**、**`start.sh not found`**、**`could not determine how to build`** 时，构建日志若在仓库根只看到 `apps/`、`docs/`、`packages/` 而无顶层 `package.json`，几乎都是 **该 Service 的 Root Directory 仍指向 monorepo 根**。此时尚未启动容器，与 Telegram、Supabase 变量无关。

### 2.2 每个 Service 的 Root Directory

| Service | Root Directory |
|---------|----------------|
| 编排 | `apps/orchestrator-service` |
| Bot | `apps/bot-service` |

在 **该 Service → Settings → Source / Build** 中设置（不是仅在 Project 级找）。

各 app 目录内的 **`railway.toml`** 声明 `RAILPACK`、`npm ci`、`npm start`、健康检查 **`/health`**；**仅当 Root 指到该目录时** Railway 才会读到该文件。

### 2.3 环境变量（概要）

**orchestrator-service**

| 变量 | 说明 |
|------|------|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **仅本服务**；勿放到 bot |
| `GRSAI_API_KEY` / `GRSAI_BASE_URL` / `GRSAI_COMPLETIONS_PATH` / `BOT_MODEL` | 按 GRSAI 文档 |
| `CORS_ORIGIN` | 可选；浏览器访问 orchestrator 时，填 Vercel 源（无尾斜杠，多个英文逗号分隔） |
| `APP_ENV` / `LOG_LEVEL` | 如 `production` / `info` |

**不要**手填 `PORT`（平台注入；代码优先读 `PORT`）。

**bot-service**

| 变量 | 说明 |
|------|------|
| `ORCHESTRATOR_BASE_URL` | orchestrator 的 **https 公网根地址**，**无尾斜杠** |
| `TELEGRAM_BOT_TOKEN` | BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | 与 `setWebhook` 的 `secret_token` 一致 |
| `TELEGRAM_SEND_REPLY` | `true` / `false` |

### 2.4 自检（公网 health）

```bash
curl -sS "https://<orchestrator 域名>/health"
curl -sS "https://<bot 域名>/health"
```

---

## 三、Vercel（admin-web · monorepo）

**`Root Directory = apps/admin-web` 与 `Framework Preset = Next.js` 缺一不可；只改其中一个，仍可能出现 Status Ready 但页面 `404: NOT_FOUND`（例如 Framework 为 Other 时构建往往只有数秒，未真正执行 `next build`）。**

| 项 | 值 |
|----|-----|
| **Root Directory** | `apps/admin-web`（**Settings → Build and Deployment**） |
| **Framework Preset** | **Next.js** |
| **Output Directory** | 留空（不要填 `dist`） |

改完后 **Save**，再 **Redeploy**；成功构建通常明显长于数秒，Build Logs 中应出现 `next build`、`Route (app)` 等。

### 环境变量（Production）

| 变量 | 值 |
|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **anon / publishable**；勿放 service_role |
| `NEXT_PUBLIC_API_BASE_URL` | Railway orchestrator 公网 `https://…`（无尾斜杠） |

修改 `NEXT_PUBLIC_*` 后须 **重新部署** 才会进入前端构建产物。

---

## 四、Supabase

### 4.1 密钥分工

| 使用方 | 密钥类型 |
|--------|----------|
| Railway orchestrator | **service_role**（服务端写库） |
| Vercel admin-web | **anon / publishable**（仅前端暴露） |
| 本地 curl 测 REST | 与前端同项目的 **anon** |

### 4.2 本地测 REST（URL 单行、整段 JWT）

勿在引号内断行；勿把说明文字当 key 粘贴。

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export ANON='<从 Settings → API 复制的整段 anon JWT>'

curl -sS -w "\nHTTP %{http_code}\n" \
  "${SUPABASE_URL}/rest/v1/employees?select=id&limit=1" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${ANON}"
```

- **`HTTP 200` + `[]`**：连通且表存在（可能尚无数据）。
- **`401 Invalid API key`**：URL 与 key 不同项目、粘贴错误或含杂质。
- 仅访问项目根 **`/`** 得到 **404 JSON** 可忽略；以 **`/rest/v1/...`** 为准。

### 4.3 浏览器请求 orchestrator

orchestrator 需配置 **`CORS_ORIGIN`**，包含 Vercel 站点源。

---

## 五、Telegram（主链）

- Webhook URL：`https://<bot 公网域名>/telegram/webhook`
- 若使用 secret：`TELEGRAM_WEBHOOK_SECRET` 与 `setWebhook` 的 `secret_token` **完全一致**。

### 5.0 更好做法：启动时自动 `setWebhook`（推荐）

仓库 **bot-service** 支持：只配 Railway，不必每次在终端 `curl`。

| 变量 | 说明 |
|------|------|
| `TELEGRAM_SYNC_WEBHOOK` | 设为 **`true`** 时，进程启动会调用 Telegram `setWebhook` |
| `BOT_PUBLIC_BASE_URL` | bot 的 **https 根地址**，无尾斜杠，例如 `https://bot-service-production-xxxx.up.railway.app` |
| `TELEGRAM_BOT_TOKEN` | 必填 |
| `TELEGRAM_WEBHOOK_SECRET` | 可选；若填写，会自动作为 `secret_token` 登记，与校验逻辑**同源**，避免 401 |

本地开发勿开 `TELEGRAM_SYNC_WEBHOOK`，以免把本地 URL 登记到 Telegram。

### 5.1 用日志定位断点（pipeline）

部署包含 **`[bot-service] pipeline:`** / **`[orchestrator-service] pipeline:`** 前缀的日志。在 **Railway → bot-service / orchestrator-service → Logs** 中，私聊发一条后按序号对照：

| 日志 | 含义 |
|------|------|
| `boot` + `ORCHESTRATOR_BASE_URL` | 启动时编排地址是否正确（勿为 `localhost`、勿漏 `https://`） |
| `0_secret_mismatch` | Webhook 带 secret 但与 `TELEGRAM_WEBHOOK_SECRET` 不一致（常见：Railway 与 `setWebhook` 的 `secret_token` 不一致，或复制时多了空格/换行；代码已对两侧做 **trim**） |
| `0_secret_mismatch` + `header_present: false` | 有请求未带 secret（扫描、误请求等）；真实用户消息来自 Telegram 时应为 `header_present: true` |
| `skip_no_message` | 更新类型不是普通文本消息 |
| `1_webhook_ok` | Webhook 已进入业务逻辑 |
| `2_forward_orchestrator` + `url=` | 即将请求的 ingest 完整 URL |
| `pipeline: error` | 转发 orchestrator 失败（看 `status`、`details`） |
| `3_orchestrator_ok` + `has_reply_text` | 编排是否返回正文 |
| `4_send_telegram` / `5_send_telegram_done` | 是否已调 Telegram `sendMessage` |
| orchestrator `ingest_start` | bot 已打到编排；若 bot 无 `3_` 而编排无此行，多为 URL/网络问题 |

---

## 六、现象 → 优先检查（速查）

| 现象 | 优先检查 |
|------|----------|
| Railway Railpack / `start.sh` | Service **Root Directory** 是否为 `apps/orchestrator-service` 或 `apps/bot-service` |
| Vercel Ready 但 404、构建极短 | **Framework Preset** 是否为 **Next.js**；Root 是否为 **`apps/admin-web`** |
| Vercel 顶栏变量未配置 | 是否已 **Redeploy**；变量是否在 Production 环境 |
| Supabase curl 401 | 是否为真实 anon JWT；`SUPABASE_URL` 是否同项目 |
| curl `Malformed URL` | URL **一行**写完，勿在双引号内换行 |

---

## 七、配套文档（分册）

| 文档 | 用途 |
|------|------|
| [`railway-minimal.md`](./railway-minimal.md) | Railway 双服务、面板逐项对照、`railway.toml` |
| [`full-stack-integration.md`](./full-stack-integration.md) | 全栈变量总表与推荐接通顺序 |
| [`vercel-admin-web.md`](./vercel-admin-web.md) | Vercel Root、Framework、环境变量与 404 排查 |
| [`vercel-404-and-paths.md`](./vercel-404-and-paths.md) | 404 时区分仓库路径、Vercel Root、URL |
| [`local-testing.md`](./local-testing.md) | 本地 health / ingest / webhook 分层测试 |

---

*本文档不含真实密钥；部署后请在各平台控制台管理 secret。*
