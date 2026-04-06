# AI Employee V1 — 进度快照

> 更新时间：以仓库当前状态与 Supabase 实际库状态为准（本地开发阶段）。

## 当前阶段
P0 已收口；P1 主链路（GRSAI → Supabase → Telegram）已在代码层接通，进入场景深化（如 `/intel`）前以线上配置与 GRSAI 文档对齐为主。

## 已完成

| 区域 | 状态 | 说明 |
|------|------|------|
| 项目骨架 | 完成 | 已建立 `apps/`、`packages/`、`docs/` 基础结构。 |
| 总纲文档 | 完成 | 已有系统架构 V1 与 AI总经理岗位说明书。 |
| 根环境模板 | 完成 | 根目录 `.env.example` 已覆盖 Telegram、Bot、Orchestrator、GRSAI、Supabase、Admin Web、`APP_ENV`、`LOG_LEVEL`。 |
| Supabase 核心表 | 完成 | 数据库实际已落地 `employees`、`jobs`、`messages`、`reports` 四张核心表。 |
| 种子员工 | 完成 | 已插入首批员工：世界情报员、赚钱雷达员、创业雷达员。 |
| bot-service 骨架 | 完成 | `apps/bot-service/` 已具备 `package.json`、`.env.example`、`src/index.js`、`README.md`。 |
| bot-service 本地启动 | 完成 | 已可 `npm install` + `npm run dev`。 |
| 健康检查 | 完成 | `GET /health` 已可用。 |
| webhook 最小入口 | 完成 | `POST /telegram/webhook` 已能做 secret 校验、message 解析、日志记录。 |
| orchestrator-service 骨架 | 完成 | `apps/orchestrator-service/`：`GET /health`、`POST /internal/ingest/telegram`。 |
| bot → orchestrator 转发 | 完成 | bot-service 将 Telegram 更新转发至 `ORCHESTRATOR_BASE_URL`。 |
| orchestrator → GRSAI | 完成 | `callGRSAI()`：OpenAI 兼容 `chat/completions`（`GRSAI_BASE_URL` + `GRSAI_COMPLETIONS_PATH`）。 |
| orchestrator → Supabase | 完成 | 每条 ingest：`jobs` pending → 模型 → `messages` 一条 → `jobs` succeeded/failed。 |
| Telegram 真回复 | 完成 | bot 在拿到 `reply_text` 后调用 `sendMessage`（可用 `TELEGRAM_SEND_REPLY=false` 关闭）。 |
| bot 默认端口 | 完成 | 默认 **8010**，与常见本机 **8000** 占用错开。 |

## 当前未完成

| 区域 | 状态 | 说明 |
|------|------|------|
| orchestrator-service | 运行中 | 主链路已接；需按 GRSAI 实际文档校对 URL/路径/模型名。 |
| `/intel` 情报员入口 | 未开始 | 世界情报员逻辑尚未接入。 |
| Admin Web | 未开始 | 后台前端尚未开始施工。 |

## 下一步（严格顺序）

1. ~~同步 `docs/supabase-schema-v1.sql`~~（已与四表结构对齐；若线上库有额外迁移，再补差异）。  
2. ~~新建 `apps/orchestrator-service/` 最小骨架~~。  
3. ~~`bot-service` 转发至 orchestrator~~。  
4. ~~orchestrator stub 验证通路~~。  
5. ~~接入 GRSAI~~（OpenAI 兼容形态；以你控制台文档为准微调）。  
6. ~~写入 Supabase 的 `messages` 与 `jobs`~~。  
7. ~~打通 Telegram 真回复~~。  
8. 再开始 `/intel` 与 `reports`。  
9. 最后再补 Vercel Admin Web。  

## 密钥放置原则

### 前端（Vercel）
只放：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_BASE_URL`

### 后端（Railway / 本地后端）
放：
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `GRSAI_API_KEY`
- `GRSAI_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 本地
- `.env` / `.env.local`
- 真实密钥不入库

## 当前最重要目标
不是做后台，不是做多员工，而是先打通：

Telegram → bot-service → orchestrator-service → GRSAI → Supabase → Telegram
