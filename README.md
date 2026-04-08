# ai-employee-v1

AI 员工公司 V1：面向云端 7×24 在线运行的 AI 组织型系统骨架。

当前版本的核心目标不是「做一个会聊天的 bot」，而是先打通一条最小但真实可运行的主链：

```text
Telegram → bot-service → orchestrator-service → GRSAI → Supabase → Telegram
```

在这条主链稳定之前，不抢跑复杂 worker，不堆多岗位复杂逻辑，不提前做重后台。

## 项目定位

本项目的目标是构建一个可在线运行、可落账、可扩张、可授权的 AI 员工公司 V1。

系统核心原则：

- Telegram 是老板入口与汇报出口
- Railway 是云端运行层
- Supabase 是事实账本
- Vercel 是管理后台前端承载
- GRSAI 是主模型供应层
- Cursor 是研发提效工具，不是生产运行层

## 当前阶段

### 当前判断

- P0 已收口
- P1 主链路已在代码层接通
- 当前进入**生产校准阶段**

### 当前主线

先做：

1. GRSAI 文档与线上配置对齐
2. 主链稳定化
3. `/intel` 与 `reports`
4. `admin-web`

## 目录结构

| 路径 | 说明 |
|------|------|
| `apps/bot-service` | Telegram Webhook 入口、转发编排、`sendMessage` |
| `apps/orchestrator-service` | AI 总经理中枢，负责 GRSAI + Supabase 账本 |
| `apps/admin-web` | 管理后台（老板 / 助理视图，待实现） |
| `packages/shared` | 共享类型、工具函数、schema（待实现） |
| `packages/prompts` | Prompt、模板与岗位资产（待实现） |
| `docs/` | 岗位说明、架构文档、Schema、进度文档 |

## 系统分工

### `bot-service`

负责：

- 接收 Telegram Webhook
- 解析消息
- 转发给 `orchestrator-service`
- 调用 Telegram `sendMessage`

不负责：

- 模型调用
- 数据库落账
- 报告生成
- 员工调度

### `orchestrator-service`

负责：

- 接收 bot 转发消息
- 调用 GRSAI
- 写入 Supabase
- 返回 `reply_text`

不负责：

- 前端页面展示
- 复杂后台管理
- V1 之外的大规模 worker 编排

### `admin-web`

负责：

- 老板视图
- 助理视图
- 任务页
- 员工页
- 报告页

不负责：

- 模型调用
- 生产调度
- 高权限账本写入

## 当前能力范围

### 已完成

| 区域 | 状态 | 说明 |
|------|------|------|
| 项目骨架 | 完成 | 已建立 `apps/`、`packages/`、`docs/` |
| 文档骨架 | 完成 | 已有系统架构与 AI 总经理岗位说明书 |
| Supabase 核心表 | 完成 | 已落地 `employees`、`jobs`、`messages`、`reports` |
| 种子员工 | 完成 | 已插入世界情报员、赚钱雷达员、创业雷达员 |
| `bot-service` | 完成 | 已具备 webhook、转发、`sendMessage` |
| `orchestrator-service` | 完成 | 已具备 GRSAI 调用与 Supabase 落账 |
| Telegram 真回复 | 完成 | 主链代码层已打通 |
| `admin-web` | 未开始 | 仅占位，后续实现 |

## 主链路说明

当前最重要目标：**不是做后台，不是堆岗位，而是先把主链跑稳。**

主链流程如下：

1. Telegram 用户发送消息
2. `bot-service` 接收 webhook
3. `bot-service` 转发到 `orchestrator-service`
4. `orchestrator-service` 创建 `jobs`（`pending`）
5. `orchestrator-service` 调用 GRSAI
6. `orchestrator-service` 写入 `messages`
7. `orchestrator-service` 更新 `jobs`（`succeeded` / `failed`）
8. `bot-service` 调用 Telegram `sendMessage`
9. 老板在 Telegram 收到回复

## 环境变量

复制根目录 `.env.example` 为 `.env`，或按 app 分别创建本地环境文件。

```bash
cp .env.example .env
```

各应用的变量说明与示例见对应目录下的 **`README.md`** 与 **`.env.example`**（文件名请使用 `README`，避免拼写错误）。

### 本地默认端口建议

- **bot-service：`8010`**
- **orchestrator-service：`8001`**

这样可以避开常见本机 `8000` 占用。

## 密钥放置原则

### 前端（Vercel）

只允许放：

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

### 规则

- 真实密钥不入库
- 前端不存后端高权限凭证
- 敏感变量只放后端

## 本地开发

### 1. `bot-service`

```bash
cd apps/bot-service
npm install
npm run dev
```

健康检查：

```bash
curl http://localhost:8010/health
```

### 2. `orchestrator-service`

```bash
cd apps/orchestrator-service
npm install
npm run dev
```

健康检查：

```bash
curl http://localhost:8001/health
```

## Railway（云端 · monorepo）

- **两个 Service**，同一 GitHub 仓库；**每个 Service** 在 **Settings → Source** 把 **Root Directory** 设为 **`apps/orchestrator-service`** 或 **`apps/bot-service`**。根目录若留空或 `./`，构建会看到 `apps/`、`docs/`、`packages/` 而无 `package.json`，出现 **`start.sh not found` / `Railpack could not determine how to build`**。
- 各 app 目录内已有 **`railway.toml`**（`npm ci`、`npm start`、健康检查 **`/health`**）。**与 Railway 面板逐项对齐**见 [`docs/railway-minimal.md`](docs/railway-minimal.md) 中的 **「Railway 面板逐项对照」**；变量与全栈顺序见 [`docs/full-stack-integration.md`](docs/full-stack-integration.md)。

## 当前严格顺序

1. 校准 GRSAI URL / 路径 / 模型名
2. 稳定 Telegram → bot → orchestrator → Supabase → Telegram 主链
3. 再做 `/intel` 与 `reports`
4. 最后再做 `admin-web`

在主链未稳前，不提前扩 worker，不堆多岗位复杂逻辑。

## 数据表

当前核心表：

| 表名 | 说明 |
|------|------|
| `employees` | 员工注册表 |
| `jobs` | 任务账本 |
| `messages` | 会话消息记录 |
| `reports` | 结构化报告表 |

后续规划表（概念）：`departments`、`feedback`、`schedules`、`permissions`、`artifacts` 等。

## 当前首批员工

| 岗位 | 说明 |
|------|------|
| 世界情报员 | 扫描 AI / 科技 / 平台动态 |
| 赚钱雷达员 | 识别可变现机会 |
| 创业雷达员 | 识别可产品化 / 可业务化方向 |

## 文档

- [`docs/cloud-deploy-handbook.md`](docs/cloud-deploy-handbook.md) — **云端部署总纲**（Railway / Vercel / Supabase / Telegram；链至各分册）
- [`docs/ai-manager-role.md`](docs/ai-manager-role.md) — AI 总经理岗位说明书
- [`docs/system-architecture-v1.md`](docs/system-architecture-v1.md) — 组织架构与技术总纲（V1）
- [`docs/supabase-schema-v1.sql`](docs/supabase-schema-v1.sql) — Supabase Schema
- [`docs/progress.md`](docs/progress.md) — 当前进度快照
- [`docs/local-testing.md`](docs/local-testing.md) — 本地分层测试（health / ingest / webhook）
- [`docs/railway-minimal.md`](docs/railway-minimal.md) — Railway 双服务最小上线与公网验证
- [`docs/vercel-admin-web.md`](docs/vercel-admin-web.md) — Vercel 部署 `admin-web`（Root Directory、环境变量）
- [`docs/vercel-404-and-paths.md`](docs/vercel-404-and-paths.md) — 404 时如何区分「仓库路径 / Vercel 根目录 / URL」
- [`docs/full-stack-integration.md`](docs/full-stack-integration.md) — **全栈接通**：Supabase → Railway（双服务）→ Telegram → Vercel

## 工程原则

- 先通主链，再扩功能
- 文档必须追平真实状态
- 本地只做开发、调试、发版、应急接管
- 云端才承担在线运行职责
- 组织能力优先于零散脚本能力
- Cursor 用于研发提效，不用于生产托管

## 下一步

当前下一步不是扩功能，而是：

1. 对齐 GRSAI 实际接口文档
2. 稳定主链运行质量
3. 开始 `/intel`
4. 接入 `reports`
5. 最后再补 `admin-web`

## 一句话总结

AI Employee V1 当前已完成 P1 主链代码闭环，下一阶段不是扩功能，而是做主链稳定化、账本语义补强与场景化入口接入。
