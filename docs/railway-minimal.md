# Railway 最小线上验证（bot + orchestrator）

目标：在**不接 Telegram Webhook** 的前提下，先证明「云端能启动、端口正确、环境变量进进程、公网 health 可打」。Webhook 真挂放在本 runbook 通过后做。

---

## 先读这一段：你现在的错误是不是这一类？

| 现象 | 含义 |
|------|------|
| **`Error creating build plan with Railpack`** | 构建计划阶段就失败：**还没启动容器、还没读环境变量、还没跑到 `/health`**。 |
| 部署记录里是 **`docs:` / `feat:`** 等 commit | 只说明 **GitHub 联动正常**、按最新提交触发了构建，**不表示**构建上下文已经进了 `apps/…`。 |
| Service 名字等于 **仓库名**（如 `ai-employee-v1`） | 常见于「从 GitHub 一键加一个服务」的默认命名；**本身不犯法**，但若 **Root Directory 仍为空（仓库根）**，就会和 monorepo 根目录结构冲突，Railpack 仍不知道 build 谁。 |

**结论：** 先修 **Service → Settings → Source → Root Directory**，再谈变量与 Telegram。需要 **两个 Service**，分别指向 **`apps/orchestrator-service`** 与 **`apps/bot-service`**（可在 Railway 里把服务重命名成 `orchestrator` / `bot` 便于辨认）。

---

## 前置假设

- 代码已在 GitHub，Railway 从仓库部署。
- 同一仓库建 **两个 Railway Service**（或两个 Project 各一个 Service），分别对应两个 app 目录。

---

## 故障速查：Railpack / `start.sh not found` / `could not determine how to build`

若构建日志里 **根目录列出的是** `apps/`、`docs/`、`packages/`、`.env.example`（整仓根），并出现：

- `Script start.sh not found`
- `Railpack could not determine how to build the app`

**原因**：该 Service 的 **Root Directory 仍指向仓库根**。根目录没有 Node 的 `package.json`，Railpack 无法识别为 Node 应用。

**处理**（每个 Service 各做一次）：

1. 先**离开「项目设置」**：点左侧栏最上面的 **画布 / 网格图标**（回到项目画布），**点进你要部署的那一个 Service 卡片**（例如 GitHub 拉起来的那条服务）。  
2. 打开的是 **Service** 页面后，再点该 Service 上的 **Settings**（或顶部 **Deployments** 旁的设置入口）。  
3. 在 **Service Settings** 里找 **Source**、**Build** 或 **Root Directory**（Railway 版本不同，名称可能二选一或都有）：把 **Root Directory** 设为 **`apps/orchestrator-service`** 或 **`apps/bot-service`**。  
4. **不要**在 **Project → Settings → General**（项目名、Visibility 那一页）里找——那里**没有** Root Directory。

若画布上**还没有任何 Service**，请先 **New → GitHub Repo** 创建服务，再对该服务做第 2–3 步。

5. **保存** 后触发 **Redeploy**。

**通过后**的日志里，构建上下文应直接出现 `package.json`、`src/` 等，而**不是**只在根下看到一个 `apps` 文件夹。

---

## 1. Service A：`orchestrator-service`

| 设置项 | 建议值 |
|--------|--------|
| Root Directory | `apps/orchestrator-service` |
| Build Command | （默认）`npm install` |
| Start Command | `npm start`（即 `node src/index.js`） |

### 环境变量（该服务内）

| 变量 | 说明 |
|------|------|
| `PORT` | **通常由 Railway 自动注入**，无需手写；代码已 **优先读 `PORT`**。 |
| `HOST` | 可选；默认 **`0.0.0.0`**，保证容器外可访问。 |
| `CORS_ORIGIN` | 可选；Vercel 管理后台源（如 `https://xxx.vercel.app`），多个逗号分隔。 |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **仅本服务**，勿放到 bot 若 bot 不需要写库 |
| `GRSAI_API_KEY` | GRSAI |
| `GRSAI_BASE_URL` | 含 `/v1` 等前缀的 Base URL（以 GRSAI 文档为准） |
| `GRSAI_COMPLETIONS_PATH` | 默认 `/chat/completions`（与 `.env.example` 一致） |
| `BOT_MODEL` | 模型名 |
| `APP_ENV` | 如 `production` |
| `LOG_LEVEL` | 如 `info`；需要云端启动诊断摘要时可临时 `debug` |

部署完成后，在 Railway 面板复制该服务的 **公网 URL**（形如 `https://xxx.up.railway.app`），记为 **`ORCHESTRATOR_PUBLIC_URL`**。

### 验证

```bash
curl -sS "https://<ORCHESTRATOR_PUBLIC_URL>/health"
```

期望 JSON 含 `"ok":true`，`"service":"orchestrator-service"`。

### ingest（可选，确认 GRSAI + Supabase 在云端真通）

```bash
curl -sS -X POST "https://<ORCHESTRATOR_PUBLIC_URL>/internal/ingest/telegram" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"123456","text":"railway smoke","telegramUserId":"999999","telegramUpdate":{}}'
```

期望：`reply_text`、且 Supabase `jobs` / `messages` 有记录（与本地 [`local-testing.md`](./local-testing.md) 一致）。

---

## 2. Service B：`bot-service`

| 设置项 | 建议值 |
|--------|--------|
| Root Directory | `apps/bot-service` |
| Start Command | `npm start` |

### 环境变量（该服务内）

| 变量 | 说明 |
|------|------|
| `PORT` | Railway 自动注入；代码 **优先读 `PORT`**。 |
| `ORCHESTRATOR_BASE_URL` | **必须**指向 Service A 的 **公网 HTTPS**（上文的 `ORCHESTRATOR_PUBLIC_URL`，**无尾部斜杠**）。 |
| `TELEGRAM_BOT_TOKEN` | 可先不配，仅测 health；接 Webhook 前再配。 |
| `TELEGRAM_WEBHOOK_SECRET` | 可选；与 Telegram `setWebhook` 的 `secret_token` 一致。 |
| `TELEGRAM_SEND_REPLY` | 线上调试可暂设 `false`，避免误发。 |
| `APP_ENV` / `LOG_LEVEL` | 同上 |

**常见错误：** `ORCHESTRATOR_BASE_URL` 写成 `localhost`、或写成带错路径的旧域名、或 orchestrator **未先部署**导致 bot 转发 502。

### 验证

```bash
curl -sS "https://<BOT_PUBLIC_URL>/health"
```

期望：`"service":"bot-service"`。

---

## 3. 内外网地址怎么选（先简单后优化）

- **第一期（推荐）：** `bot-service` → `ORCHESTRATOR_BASE_URL` 用 **orchestrator 的公网 URL**。简单、和本地「localhost:8001」心智一致。
- **后续：** 若两服务在同一 Railway 环境，可再研究 **Private Networking** / 内部 DNS，减少公网绕行；不在本最小 runbook 强制要求。

---

## 4. Telegram Webhook（本 runbook 通过后）

1. 确认 `bot-service` 公网可访问：`GET /health`。
2. 使用 Telegram `setWebhook`，URL 形如：  
   `https://<BOT_PUBLIC_URL>/telegram/webhook`  
3. 若使用 `secret_token`，在 Railway 配置 `TELEGRAM_WEBHOOK_SECRET` 与之一致。
4. 将 `TELEGRAM_SEND_REPLY` 设为 `true` 做真机收发。

---

## 5. 线上典型坑（对照自查）

| 现象 | 可能原因 |
|------|----------|
| 服务起不来 | Root Directory 错、未 `npm install`、`node` 版本过旧（建议 **Node 20 LTS**） |
| health 404 | 路径不是 `/health`、或域名指错服务 |
| ingest 503 | orchestrator 上 **未配** `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |
| bot 502 | `ORCHESTRATOR_BASE_URL` 错误、orchestrator 未就绪、或 URL 带多余 `/` 导致双斜杠（建议 base **无尾斜杠**） |
| GRSAI 失败 | `GRSAI_BASE_URL` / `GRSAI_COMPLETIONS_PATH` 与官方文档不一致、或出口网络限制 |

---

## 6. 与本地 runbook 的关系

- 本地：[`docs/local-testing.md`](./local-testing.md)（顺序、curl、无 `.env` 时的预期）。
- 线上：本文件（两服务、公网 health、`ORCHESTRATOR_BASE_URL`、最后再 Webhook）。

当前阶段口径：**先 Railway 最小闭环，再扩 `/intel` / Admin。**
