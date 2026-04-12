# Railway 完整对接与排障（架构 vs 接口 vs 配置）

> **默认先按「配置错误」处理**：在 **Root Directory、Public Domain、Webhook、`ORCHESTRATOR_BASE_URL`** 四项未排除前，**不讨论架构缺陷**。本项目多数线上故障（404、`Application not found`、secret 不一致）落在这四类，而非服务拆分设计错误。

本文帮助你在 **「架构设计」**、**「HTTP/业务接口」**、**「平台与环境配置」** 三类问题之间做判断，并给出可执行的对接清单、防呆约束与排查顺序。

---

## 一、先分清三类问题

| 类型 | 含义 | 典型表现 | 是否改代码 |
|------|------|----------|------------|
| **架构** | 服务划分、数据流、谁调谁 | 例如「bot 该不该直连 Supabase」——当前设计是 **只有 orchestrator 用 service role** | 一般不改也能先跑通；大改才动架构 |
| **接口** | 路径、方法、请求体、响应字段是否符合约定 | `404 Cannot POST /xxx`、orchestrator 返回体缺 `reply_text` | 可能改 `apps/*/src` |
| **配置（Railway / Telegram / 变量）** | Root Directory、公网域名、环境变量、Webhook、secret | `Application not found`、`401 secret`、`502 连不上 orchestrator` | **不改代码**，改控制台与变量 |

**经验法则：**  
- **`Application not found`**、**Root Directory 错**、**域名手拼** → 几乎都是 **配置**，不是架构缺陷。  
- **`1_webhook_ok` 之后 `orchestrator responded 404` 且 Railway 报 `Application not found`** → **bot 里 `ORCHESTRATOR_BASE_URL` 与 orchestrator 真实公网域名不一致** → **配置**。  
- **`POST /internal/ingest/telegram` 返回 HTTP 200 但 JSON `ok: false`**（如 `stage: grsai`）→ **上游/模型问题**；若 **`ok: true` 仍无可用 `reply_text`** → 多为 **orchestrator 内部或边界数据** → 偏 **接口/业务**。  
- 两服务 **Root 指错 monorepo 根** → **配置**；仓库内 **路径、路由写错** → **接口/代码**。

---

## 二、架构总览（当前仓库约定）

```text
Telegram 云端
    │ HTTPS Webhook
    ▼
┌─────────────────────────────────────┐
│  Railway: bot-service               │
│  Root: apps/bot-service             │
│  入口: POST /telegram/webhook       │
│  出站: POST {ORCHESTRATOR_BASE_URL} │
│        /internal/ingest/telegram    │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Railway: orchestrator-service      │
│  Root: apps/orchestrator-service    │
│  POST /internal/ingest/telegram     │
│  出站: GRSAI、Supabase（服务端密钥）  │
└─────────────────────────────────────┘
```

- **架构边界**：Telegram 只认识 **bot 的公网 URL**；**浏览器 / Vercel admin-web** 只应持 **anon**，**不写** service role；**编排**集中访问 GRSAI 与 Supabase。

### 2.1 公网域名 vs 内网域名（硬规则）

| 场景 | 应使用的地址 |
|------|----------------|
| Telegram 登记 Webhook | **bot-service** 在 Networking 里生成的 **公网 HTTPS 根** + path `/telegram/webhook` |
| 本机 / 浏览器 / CI `curl` 测 orchestrator | **orchestrator-service** 的 **公网** `https://….up.railway.app`（与控制台一致） |
| `ORCHESTRATOR_BASE_URL`（bot → orchestrator） | **仅** orchestrator **公网根**，见下文 **§3.1 禁止项** |
| `*.railway.internal` | **仅** Railway 私有网络内解析；**禁止**在本地笔记本当 `curl`/浏览器目标来验证「是否通」 |

服务间调用当前实现为 **bot 用公网 URL 调 orchestrator**；若将来改为内网，须在 **同一 Railway 项目/网络** 内显式约定，且与本地调试方式区分，避免混用。

---

## 三、强约束：`ORCHESTRATOR_BASE_URL`

**必须**：从 **Railway → orchestrator-service → Networking → Public Domain** 的展示值 **整段复制** 为 base（`https://主机`，**无 path**）。

**禁止**（线上大量问题来自这里）：

| 禁止 | 原因 |
|------|------|
| 手猜、手拼、沿用旧项目/旧环境的 `….up.railway.app` | 域名轮换或复制错服务后 **404 / Application not found** |
| `https://….railway.internal` 或任何 **内网主机** 填进 bot 的该变量（若 bot 不在同一私有网络） | 解析或路由失败 |
| 把 **完整 ingest path** 写进 base：`…/internal/ingest/telegram` | base 应只有 origin；path 由代码拼接 |
| 尾斜杠 `/`、query `?…`、fragment `#…` | 与 `fetch` 拼接 path 时易重复或错位 |

**推荐表述**：`ORCHESTRATOR_BASE_URL` = **与 orchestrator 当前 Networking 中公网域名一字不差**（仅 scheme + host，必要时含端口；本项目一般为 `https://….up.railway.app`）。

---

## 四、接口契约

### 4.1 bot-service → orchestrator-service（成功路径）

| 项 | 约定 |
|----|------|
| 方法 | `POST` |
| 路径 | `/internal/ingest/telegram`（相对 **orchestrator 根 URL**） |
| Base | 见 **§3** |
| 请求体 | JSON；业务上至少需要 `chatId`（见实现） |
| 成功响应 | `ok: true`, `stage: "done"`, **`reply_text`**, `grsai_error: null`（及 `job_id` / `message_id` 等） |

### 4.2 失败响应（当前实现，便于对照日志）

以下为 **`apps/orchestrator-service/src/index.js`** 中与 `POST /internal/ingest/telegram` 相关的行为摘要（以代码为准）。**统一字段**：失败均为 `ok: false`，并带 **`stage`**、**`error`**（短码）、**`detail`**（可读说明）。

| HTTP | `stage` | 条件 | `error`（示例） |
|------|---------|------|----------------|
| **400** | `validation` | 缺少 `chatId` | `invalid_request` |
| **503** | `supabase` | Supabase 未配置 | `supabase_not_configured` |
| **500** | `supabase` | `saveJobPending` 失败 | `ledger_pending_failed` |
| **500** | `supabase` | `saveMessage` 失败 | `save_message_failed` |
| **500** | `internal` | `updateJob` 失败 | `job_update_failed` |
| **200** | `grsai` | GRSAI 调用抛错（仍落账并返回占位 `reply_text`） | `grsai_error` |

**说明**：GRSAI 失败时 **HTTP 仍为 200**，但 **`ok: false`**，**不得**只靠状态码判断；请看 **`stage` / `detail`**（与 `grsai_error` 同义信息）。bot 会打 **`3_orchestrator_failed`** 并带上 `stage` / `error` / `detail`。

### 4.3 健康检查与「就绪」深度

| 端点 | 服务 | 作用 |
|------|------|------|
| `GET /health` | bot、orchestrator | **进程存活**（Railway healthcheck 使用） |
| `GET /ready` | orchestrator | **静态配置就绪**：检查 `SUPABASE_*`、`GRSAI_*`、`BOT_MODEL` 等是否已设置；**不做**外网探测。`status: ready` → HTTP **200**；`not_ready` → **503** |
| `GET /diagnostics` | bot | 环境开关与 **最近 Webhook 事件**（无密钥；排障用） |
| 前端 `/ops`（Vercel） | admin-web | 服务端拉 orchestrator `GET /health`（需 `NEXT_PUBLIC_API_BASE_URL` 正确） |

**注意**：**`/health` 与 `/ready` 均不能**证明 GRSAI/Supabase **调用**一定成功；上线前仍结合 **§八** 与环境变量核对。

### 4.4 Telegram Webhook：**单一注册策略**（必选一个）

生产环境须明确采用 **且仅采用** 一种方式，**禁止**自动 `setWebhook` 与手工在 @BotFather/控制台各改各的混用（易导致 URL 或 `secret_token` 与代码不一致）。

| 策略 | 要求 |
|------|------|
| **A. 启动时同步** | `TELEGRAM_SYNC_WEBHOOK=true`，`BOT_PUBLIC_BASE_URL` 与 bot **公网根**一致；部署后看日志确认 `setWebhook` 成功 |
| **B. 全手动** | `TELEGRAM_SYNC_WEBHOOK` 不启用；由你方 **唯一流程** 设置 Webhook URL 与 secret；改 URL 后必须同步变量 |

无论 A/B，**`TELEGRAM_WEBHOOK_SECRET`（若启用）必须与 Telegram 侧登记的 `secret_token` 完全一致**（含长度；见 bot 日志中的 `received_len` / `expected_len`）。

---

## 五、Railway 平台配置清单（每个 Service）

### 5.1 通用

| 检查项 | orchestrator | bot |
|--------|--------------|-----|
| Root Directory | `apps/orchestrator-service` | `apps/bot-service` |
| 公网域名 | Networking 中 **Generate**，得到 `https://….up.railway.app` | 同左 |
| 监听 | 代码读 **`PORT`**（容器内端口由平台注入） | 同左 |

### 5.2 环境变量（摘要）

**orchestrator-service**

- `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
- `GRSAI_*`、`BOT_MODEL` 等
- **不要**把 `NEXT_PUBLIC_*` 放这里

**bot-service**

- `TELEGRAM_BOT_TOKEN`
- **`ORCHESTRATOR_BASE_URL`**（见 **§3**）
- `TELEGRAM_SEND_REPLY`
- `TELEGRAM_WEBHOOK_SECRET`（可选；与 Telegram 登记一致）
- `TELEGRAM_SYNC_WEBHOOK`、`BOT_PUBLIC_BASE_URL`（可选；与 **§4.4** 策略一致）

---

## 六、现象 → 归类（架构 / 接口 / 配置）

| 现象 | 更可能类别 | 首先动作 |
|------|------------|----------|
| 构建阶段 Railpack / `start.sh` / 看不到 `package.json` | 配置 | Root Directory 是否指向 `apps/…` |
| `GET …/health` 返回 **`Application not found`**（Railway 边缘） | 配置 | 域名是否复制自 **当前** Networking，非占位、非内网域名在本地测 |
| bot 日志 `orchestrator responded 404` + `Application not found` | 配置 | 修正 **`ORCHESTRATOR_BASE_URL`**，与 orchestrator 公网根一致 |
| `0_secret_mismatch` / `received_len` ≠ `expected_len` | 配置 | 对齐 `TELEGRAM_WEBHOOK_SECRET` 与 `setWebhook`，或去掉 secret |
| `POST /internal/ingest/telegram` 返回应用 JSON 4xx（非边缘 HTML） | 接口或业务 | 读 orchestrator 日志与返回体 |
| orchestrator **HTTP 200** 但 JSON **`ok: false`**（常见 `stage: grsai`） | 接口/依赖 | 看 **`detail`** / `error`，勿假设 200 即成功 |
| Vercel `/ops` 探测 orchestrator `/health` 失败 | 配置 | `NEXT_PUBLIC_API_BASE_URL` 是否与 orchestrator 根一致 |

---

## 七、推荐排查顺序（与「是否架构问题」无关时先做）

1. **orchestrator 公网 `GET /health` 是否 200**（本机或 Vercel `/ops` / `./scripts/check-orchestrator-health.sh`）。  
2. **bot 的 `ORCHESTRATOR_BASE_URL` 是否与 ① 同根**（§3）。  
3. **Telegram `getWebhookInfo`**：`last_error_message`、URL 是否指向 bot。  
4. **私聊发消息**，看 bot 日志是否 **`1_webhook_ok` → 转发 orchestrator → 成功或明确错误**。  
5. 再查 GRSAI/Supabase 与返回 JSON（`ok`、`stage`、`detail`）。

详细逐步说明见 **[`cloud-deploy-handbook.md`](./cloud-deploy-handbook.md) §5.2**。

---

## 八、上线前 10 项必检

### Railway

1. **bot-service** Root Directory = `apps/bot-service`  
2. **orchestrator-service** Root Directory = `apps/orchestrator-service`  
3. 两个服务均已生成 **当前有效** 公网域名（Networking 中可见）  
4. **`ORCHESTRATOR_BASE_URL`**：从 orchestrator 的 Public Domain **直接复制**，**无尾斜杠、无 path**（§3）  
5. **`BOT_PUBLIC_BASE_URL`**（若启用同步 Webhook）：从 bot 的 Public Domain **直接复制**  

### Orchestrator

6. 公网 **`GET /health`** → 200；**（建议）`GET /ready`** → 200 且 `checks` 全为 `true`（变量已填；未填时 **503** `not_ready`）  
7. 公网 **`POST /internal/ingest/telegram`** 可访问（非边缘 `Application not found`）；可先最小 JSON 测 `chatId`  
8. `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`GRSAI_*`、`BOT_MODEL` 已在该服务配置（与 `/ready` 检查项一致）  

### Bot

9. `TELEGRAM_BOT_TOKEN`、`TELEGRAM_WEBHOOK_SECRET`（若启用）与 Telegram 侧一致；**§4.4** 策略明确且未混用  
10. 私聊机器人一条消息后，日志出现完整链路：**`1_webhook_ok`** → **`2_forward_orchestrator`** → **`3_orchestrator_ok`**（`ok: true`）或 **`3_orchestrator_failed`**（`ok: false`，含 `stage` / `error` / `detail`）；必要时打开 **`GET /diagnostics`** 看 `recent_webhook_events`  

---

## 九、相关文档索引

| 文档 | 内容 |
|------|------|
| [`cloud-deploy-handbook.md`](./cloud-deploy-handbook.md) | 部署总纲、Telegram、逐项排查 |
| [`railway-minimal.md`](./railway-minimal.md) | 双服务、面板、`railway.toml`、脚本 |
| [`full-stack-integration.md`](./full-stack-integration.md) | 全栈变量与顺序 |
| [`vercel-admin-web.md`](./vercel-admin-web.md) | Vercel、`/ops` 探测页 |

---

## 十、一句话结论

- **「架构」**在本项目里主要指：**bot 只做入口与回传，orchestrator 负责模型与账本**——除非你发现设计要改，否则多数线上问题来自 **Railway/Telegram 配置与公网 URL 不一致**，而不是接口定义错误。  
- **先保证 Root、公网根 URL、Webhook/secret 策略、变量一致**，再判断 **orchestrator 返回 JSON**（`ok`、`stage`、`detail`）与 GRSAI/Supabase。  
- **静态就绪**用 orchestrator **`GET /ready`**（**不做**外网探活）；**进程存活**用 **`/health`**；业务链看 bot 日志 **`3_orchestrator_*`** 与 **`/diagnostics`**。

---

*若你补充具体错误码、日志片段与当前变量名（打码），可将问题快速映射到 §六 中的某一格。*
