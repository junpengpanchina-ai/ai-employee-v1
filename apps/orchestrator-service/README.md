# orchestrator-service

AI 总经理 / Orchestrator 服务。

负责：

- 接收 `bot-service` 转发的 Telegram 输入
- 调用 GRSAI（OpenAI 兼容接口）
- 写入 Supabase 账本
- 返回 `reply_text` 给 `bot-service`

## 职责边界

`orchestrator-service` 是当前 V1 的中枢层，负责：

- 任务接收
- 模型调用
- 账本写入
- 最小回复生成

当前阶段不负责：

- 复杂 worker 调度
- 多部门协作编排
- 后台页面展示
- 深度情报抓取流水线

这些能力在后续阶段逐步加入。

## Railway（monorepo）

单独一个 Railway Service，**Settings → Source → Root Directory** = **`apps/orchestrator-service`**（勿用仓库根）。本目录 **`railway.toml`** 声明 `RAILPACK`、`npm ci`、`npm start`、健康检查 **`/health`**。完整清单见 [`docs/railway-minimal.md`](../../docs/railway-minimal.md)。

## 当前能力

- `GET /health`：健康检查
- `POST /internal/ingest/telegram`：接收 bot 转发的内部消息
- `callGRSAI()`：调用 OpenAI 兼容 `chat/completions`
- 写入 `jobs`
- 写入 `messages`
- 返回 `reply_text`

## 当前主链路

```text
Telegram
  → bot-service
  → orchestrator-service
  → GRSAI
  → Supabase
  → bot-service
  → Telegram
```

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

按本地或部署环境填写，不要提交真实密钥。

## 本地启动

```bash
npm install
npm run dev
```

默认端口：`ORCHESTRATOR_PORT=8001`

健康检查：

```bash
curl http://localhost:8001/health
```

## 路由

### `GET /health`

健康检查。

返回示例：

```json
{
  "ok": true,
  "service": "orchestrator-service",
  "time": "2026-04-06T12:00:00.000Z"
}
```

（`time` 为 ISO 8601 时间戳。）

### `GET /ready`

静态配置就绪：检查 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`GRSAI_BASE_URL`、`GRSAI_API_KEY`、`BOT_MODEL` 是否均已非空设置。**不**对 Supabase / GRSAI 发起网络请求。

- 全部具备：`HTTP 200`，`status: "ready"`，`checks` 各布尔为 `true`
- 否则：`HTTP 503`，`status: "not_ready"`

### `POST /internal/ingest/telegram`

由 `bot-service` 调用的内部入口。

请求体示例：

```json
{
  "chatId": "123456789",
  "text": "你好",
  "telegramUserId": "999999",
  "telegramUpdate": {}
}
```

说明：`telegramUpdate` 为 Telegram 原始 `update` 对象（与 `bot-service` 转发字段一致）。

处理流程：

1. 接收来自 bot 的消息
2. 创建 `jobs` 记录，状态为 `pending`
3. 调用 `callGRSAI()`
4. 写入 `messages`
5. 成功则更新 `jobs` 为 `succeeded`
6. 失败则更新 `jobs` 为 `failed`

响应体约定：**成功**为 `ok: true` 且 `stage: "done"`；**失败**为 `ok: false`，并带 `stage`（`validation` | `supabase` | `grsai` | `internal`）、`error`（短码）、`detail`。

成功示例（节选）：

```json
{
  "ok": true,
  "stage": "done",
  "service": "orchestrator-service",
  "job_id": "...",
  "message_id": "...",
  "reply_text": "...",
  "grsai_error": null
}
```

GRSAI 调用失败时仍可能 **HTTP 200**，但 **`ok: false`**、`stage: "grsai"`，并带占位 `reply_text`（便于用户侧仍收到提示）。

### `/intel` 真简报（阶段 B）

> **完整操作手册见 [`docs/intel-runbook.md`](../../docs/intel-runbook.md)**（链路图、变量、内部接口、日志模板、故障排查顺序都在那）。下面只列摘要。

- **Telegram** 发 `/intel` → `POST /internal/ingest/telegram` → `runIntelBrief()`（`src/intelRun.js`）→ **优先读 Supabase `intel_items`（时间窗口内）** → 若无数据且 `INTEL_SYNC_ON_INTEL_IF_EMPTY` 未关，则先 **sync**（拉 WM 导出并 upsert）→ 仍无则按 `INTEL_FALLBACK_LIVE_FETCH` 决定是否现场 GET 导出（兼容未建表）→ `callGRSAIWithSystem` + `src/intelPrompts.js`
- **建表**：仓库根 `supabase/migrations/*_intel_items.sql` 在 Supabase 执行一次。
- **定时供料**：Railway Cron 等定时 `POST /internal/intel/sync`（建议配置 `ORCHESTRATOR_INTERNAL_SECRET` 并在请求头带 `X-Orchestrator-Secret`）。路由实现在 `src/routes/internalIntel.js`。
- **定时推送老板**：二选一——(1) 外部定时器 `POST /internal/intel/push?slot=morning|noon|night`；(2) **进程内方式 A**：配齐 `TELEGRAM_BOSS_CHAT_ID`、`BOT_SERVICE_BASE_URL`、内部密钥后**可不设** `INTEL_AUTO_PUSH_ENABLED` 即自动开；cron 默认 8/12/21 点，**时区默认 `Asia/Shanghai`**（未设 `INTEL_AUTO_PUSH_TZ`/`TZ` 时），避免部署在 UTC 的机子上错 8 小时。显式 `INTEL_AUTO_PUSH_ENABLED=false` 可关。实现见 `src/intelPushScheduler.js`、`src/intelScheduledPush.js`。启动若未挂上调度，日志会有 `[intel-auto-push] NOT scheduled:` 与缺项提示。
- **调试**：`GET /internal/intel/brief?since_hours=24&topic=macro&channel=all`（可选密钥；`topic` 支持别名如 `market`→macro），返回 `reply_text` 与 `meta`（会调用 GRSAI）。
- **Telegram 变体**：`/intel`、`/intel 48h`、`/intel macro`（按 `intel_items.topic` 过滤）等，由 `src/intelArgs.js` 解析后读库。
- **供料兜底**：`src/intelFeed.js` 按 **WorldMonitor → RSS/Atom/JSON Feed → 内置 mock** 顺序依次尝试，任一层命中即返回；日志里 `[intel-feed] using <source>` 标注实际生效源。官方 `www.worldmonitor.app` **不**对外提供 `/api/export/intel`，需要自建 WM 实例或用 `INTEL_FALLBACK_FEEDS`。
- **环境变量**：`WORLDMONITOR_INTEL_EXPORT_URL`（推荐）或 `WORLDMONITOR_PUBLIC_URL`；可选 `WORLDMONITOR_BEARER_TOKEN` / `WORLDMONITOR_GATE_KEY`；`INTEL_SINCE_HOURS`、`INTEL_SYNC_ON_INTEL_IF_EMPTY`、`INTEL_FALLBACK_LIVE_FETCH`、`INTEL_FALLBACK_FEEDS`、`INTEL_ALLOW_MOCK`；见 `.env.example`
- 说明文档：[`docs/intel-brief-template.md`](../../docs/intel-brief-template.md)
- 勾选清单：[`docs/worldmonitor-execution-checklist.md`](../../docs/worldmonitor-execution-checklist.md) 阶段 B

## 关键环境变量

| 变量名 | 说明 |
|--------|------|
| `APP_ENV` | 运行环境 |
| `LOG_LEVEL` | 日志级别 |
| `PORT` | 部署环境（如 Railway）注入端口，优先于 `ORCHESTRATOR_PORT` |
| `HOST` | 监听地址，默认 `0.0.0.0`（容器必达） |
| `ORCHESTRATOR_PORT` | 本地默认 `8001` |
| `BOT_MODEL` | 默认模型名，如 `gemini-3.1-pro` |
| `GRSAI_API_KEY` | GRSAI API Key |
| `GRSAI_BASE_URL` | GRSAI 基础地址 |
| `GRSAI_COMPLETIONS_PATH` | OpenAI 兼容 completions 路径 |
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端高权限 Key |
| `CORS_ORIGIN` | 可选；Vercel 前端源（无尾斜杠），多个逗号分隔，供浏览器调 `GET /health` 等 |

## Supabase 当前落账范围

当前已接核心四表中的两条主线：

- `jobs`
- `messages`

执行 `supabase/migrations/` 下 SQL 后，供料与简报落账：

- `wm_raw_items` — WM 导出原始 JSON 行
- `intel_items` — 标准化情报（`dedupe_key` 去重）
- `intel_briefs` — 每次 `/intel` 或调试接口生成的简报正文与元数据（`INTEL_PERSIST_BRIEFS=false` 可关）

后续报告能力可进一步接入：

- `reports`

员工注册表已存在：

- `employees`

## 验收要点

最小验收链路：

1. `GET /health` 正常
2. `GET /ready` 为 `ready`（生产环境关键变量已配置）
3. `POST /internal/ingest/telegram` 可接收消息；成功时 `ok: true` 且 `stage: "done"`
4. `callGRSAI()` 能返回模型结果（失败时仍可能 HTTP 200 但 `ok: false`、`stage: "grsai"`）
5. `jobs` 能从 `pending` 更新到 `succeeded` 或 `failed`
6. `messages` 有真实落账
7. 返回体中包含 `reply_text`（成功或 GRSAI 失败时的占位文案）

## 工程原则

- 先保主链，不抢跑复杂功能
- 文档必须追平真实状态
- 敏感变量只放后端
- 所有主业务逻辑尽量收敛在本服务
- `/intel`、`reports`、部门化能力在主链稳后再做

## 后续可扩展

后续可加入但当前不抢跑：

- `/intel` 世界情报员入口
- `reports` 结构化报告落账
- 员工路由分发
- `trace_id` / `request_id`
- 重试机制
- `worker-service` 拆分
