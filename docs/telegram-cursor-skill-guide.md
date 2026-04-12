# Telegram 对接说明 + 如何添加 Cursor Skill

本文档两件事：

1. **本仓库里 Telegram 主链是什么、变量与验证命令**（便于你或 Agent 按同一套语境工作）。
2. **如何在 Cursor 里新增一个 Agent Skill**，让 AI 在「改 Webhook / 排 Railway / 查 orchestrator」时自动按你的规范执行。

更细的排障与 Runbook 仍以 **[`railway-integration-debug.md`](./railway-integration-debug.md)**、**[`cloud-deploy-handbook.md`](./cloud-deploy-handbook.md)**、**[`local-testing.md`](./local-testing.md)** 为准。

---

## 一、架构（一句话）

```text
Telegram ──HTTPS Webhook──► bot-service (POST /telegram/webhook)
         ──HTTP POST──────► orchestrator-service (POST /internal/ingest/telegram)
                              ──► GRSAI、Supabase（service role）
         ◄──sendMessage──── bot-service
```

- **公网 URL 只打在 bot-service**；**编排与模型在 orchestrator-service**。
- **浏览器 / 前端**不要拿 Supabase **service role**；只在 orchestrator 使用。

---

## 二、环境变量（按服务）

### bot-service（Railway：`apps/bot-service`）

| 变量 | 作用 | 值从哪里找 |
|------|------|------------|
| `TELEGRAM_BOT_TOKEN` | 调 Telegram API | [@BotFather](https://t.me/BotFather) 创建 Bot 后给的 Token |
| `ORCHESTRATOR_BASE_URL` | 转发编排 | **Railway → orchestrator-service → Networking → Public Domain**，完整 `https://…`，**无尾斜杠**，且必须是 **orchestrator 域名**，不是 bot 域名 |
| `TELEGRAM_SEND_REPLY` | 是否 `sendMessage` | `true` / `false`（默认等价 true） |
| `TELEGRAM_WEBHOOK_SECRET` | 与 Webhook `secret_token` 一致 | 自生成随机串；与 `setWebhook` 一致 |
| `TELEGRAM_SYNC_WEBHOOK` | 启动时是否自动 `setWebhook` | `true` 时配合 `BOT_PUBLIC_BASE_URL`；与手工改 Webhook **二选一**，勿混用 |
| `BOT_PUBLIC_BASE_URL` | 自动同步 Webhook 时用 | **Railway → bot-service → Networking → Public Domain**（`https://…`，无尾斜杠） |
| `PORT` | 监听端口 | Railway 注入，一般不必手写 |

### orchestrator-service（Railway：`apps/orchestrator-service`）

| 变量 | 作用 | 值从哪里找 |
|------|------|------------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 服务端写库 | Supabase 项目 **Settings → API** |
| `GRSAI_BASE_URL` / `GRSAI_API_KEY` / `BOT_MODEL` 等 | 调模型 | GRSAI（或兼容网关）控制台与文档 |
| `PORT` | 监听端口 | Railway 注入 |

---

## 三、Webhook 路径与单一策略

- **登记到 Telegram 的 URL**必须是：  
  `https://<bot 公网根>/telegram/webhook`
- **生产只选一种**：要么 **`TELEGRAM_SYNC_WEBHOOK=true`** 由服务启动时同步；要么 **全部手动** `setWebhook`，不要两种混用导致 URL/secret 不一致。

---

## 四、常用验证命令

```bash
# Webhook 信息（把 TOKEN 换成真实值；勿泄露到公开仓库）
curl -sS "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# 手动 setWebhook 示例（与自动同步二选一）
curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<BOT_PUBLIC_HOST>/telegram/webhook"

# 本机 / 云端 health（把域名换成你的）
curl -sS "https://<bot 公网>/health"
curl -sS "https://<orchestrator 公网>/health"
curl -sS "https://<orchestrator 公网>/ready"
```

**日志链（bot-service）**：`1_webhook_ok` → `2_forward_orchestrator` → `3_orchestrator_ok` 或 `3_orchestrator_failed`（含 `stage` / `error` / `detail`）。

---

## 五、常见坑（与 Skill 里可写成硬规则）

| 现象 | 常见原因 |
|------|----------|
| `Failed to parse URL` | `ORCHESTRATOR_BASE_URL` 缺 `https://` 或不是合法 URL（代码已尽量自动补全 scheme，但 **域名仍须指向 orchestrator**） |
| 指向 bot 自己的域名 | `ORCHESTRATOR_BASE_URL` 错填成 **bot-service** 公网域名，应改为 **orchestrator** Public Domain |
| `getWebhookInfo` 里仍有 `502` 历史 | 可能是旧错误；以 **`pending_update_count`** 与「新消息是否仍能回复」为准 |
| `401` / secret 相关 | `TELEGRAM_WEBHOOK_SECRET` 与 Telegram 登记的 `secret_token` 不一致 |

---

## 六、如何添加 Cursor Agent Skill

Skill 是 **带 YAML 头的 Markdown**，教 Agent 何时、如何做某件事。  
**不要**写在 `~/.cursor/skills-cursor/`（系统保留目录）。

### 6.1 放哪里

| 类型 | 路径 | 说明 |
|------|------|------|
| **项目内**（推荐与本仓库一起版本管理） | `<repo>/.cursor/skills/<skill-name>/SKILL.md` | 团队共享 |
| **个人全局** | `~/.cursor/skills/<skill-name>/SKILL.md` | 仅本机所有项目可用 |

目录结构示例：

```text
.cursor/skills/telegram-railway-bot/
├── SKILL.md           # 必填
├── reference.md       # 可选：更长清单
└── scripts/           # 可选
```

### 6.2 `SKILL.md` 最小结构

- 文件顶部 **YAML frontmatter**，至少包含：
  - `name`：小写、数字、连字符，≤64 字符  
  - `description`：说明 **做什么** + **何时用**（Agent 靠它判断是否加载）
- 正文：分步骤指令、本项目路径、禁止项、可复制的命令。

### 6.3 可直接复制改写的模板

在仓库里新建：`.cursor/skills/telegram-railway-bot/SKILL.md`（文件名固定为 `SKILL.md`）。

```markdown
---
name: telegram-railway-bot
description: >-
  Diagnoses and configures the ai-employee-v1 Telegram bot chain on Railway:
  bot-service webhook, ORCHESTRATOR_BASE_URL, orchestrator health/ready, and
  getWebhookInfo. Use when the user mentions Telegram webhook, BotFather,
  Railway bot/orchestrator, 502, ORCHESTRATOR_BASE_URL, or pipeline logs
  1_webhook_ok / 2_forward_orchestrator / 3_orchestrator_ok.
---

# Telegram × Railway（本仓库）

## 必读约束

- `ORCHESTRATOR_BASE_URL` 必须等于 **orchestrator-service** 在 Railway **Networking → Public Domain** 的 **https 根**，无尾斜杠；**禁止**填 bot-service 自己的域名。
- Webhook URL 形态：`https://<bot Public Domain>/telegram/webhook`。
- 改变量后需 **Redeploy** 或等待部署生效后再用 `getWebhookInfo` 验证。

## 执行顺序（排障）

1. `curl` orchestrator `GET /health` 与 `GET /ready`（公网根 URL）。
2. 核对 bot-service 环境变量中的 `ORCHESTRATOR_BASE_URL`。
3. 读 bot 日志是否出现 `Failed to parse URL` 或 `3_orchestrator_failed`。
4. `getWebhookInfo` 看 `url`、`pending_update_count`、`last_error_message`。

## 代码位置

- Bot：`apps/bot-service/src/index.js`（`/telegram/webhook`、转发、`sendMessage`）。
- Orchestrator：`apps/orchestrator-service/src/index.js`（`/internal/ingest/telegram`、`/ready`）。

## 文档

- 总排障：`docs/railway-integration-debug.md`
- 本地分层测试：`docs/local-testing.md`
```

保存后，在 Cursor 里与 Agent 对话时，若描述匹配 `description`，Agent 更容易自动套用该 Skill。

### 6.4 小结

1. 新建目录 `.cursor/skills/<name>/`。  
2. 放入 `SKILL.md`，写好 `name` + `description` + 正文步骤。  
3. 不要放进 `skills-cursor`；项目 Skill 跟仓库提交即可。

---

## 七、相关文档索引

| 文档 | 内容 |
|------|------|
| [`railway-integration-debug.md`](./railway-integration-debug.md) | 架构 / 配置 / 接口、上线前必检 |
| [`cloud-deploy-handbook.md`](./cloud-deploy-handbook.md) | 部署总纲、Telegram 小节 |
| [`full-stack-integration.md`](./full-stack-integration.md) | 全栈变量与接通顺序 |
| [`local-testing.md`](./local-testing.md) | 本地 health / ingest / 模拟 webhook |

---

## 八、Telegram 老板出口规范（回复质量）

**目标**：Telegram 是老板入口，不是模型调试台；用户不应看到推理标签或英文内心戏。

### 实现位置（orchestrator）

- **`apps/orchestrator-service/src/replyPolicy.js`**：`sanitizeReplyText`、`classifyInput`、健康检查与 **`/`** 命令的固定短回复。
- **`apps/orchestrator-service/src/grsai.js`**：AI 总经理 **system** 人设（短、中文、汇报口吻）。
- **`apps/orchestrator-service/src/index.js`**：ingest 中先分类 → 健康/命令可走 **不调 GRSAI** 的固定句 → 其余走 `callGRSAI` → **统一 `sanitizeReplyText`** 再落库与返回。

### 输入分类（`input_kind`）

| 值 | 含义 |
|----|------|
| `health_check` | 如 `ping`、`测试`、`123`、`在吗`、单独 `.` / `。` → 固定短句，**不调用** GRSAI（表内命中时） |
| `command` | 以 `/` 开头 → `/status`、`/intel` 等固定模板 |
| `short_chat` | 较短文本 → GRSAI +「短答」hint |
| `manager_task` | 较长文本 → GRSAI +「任务结构」hint |

成功响应 JSON 中会带 **`input_kind`**、**`grsai_skipped`**（固定回复时为 `true`）。

### 硬规则摘要

1. 去掉 redacted_thinking / think 块与部分过程性英文句式。  
2. 测试类命中表时 **不走长模型**。  
3. 默认中文、短句、总经理汇报感（由 system prompt + sanitize 共同约束）。

---

*若你只想要「Telegram Bot API 消息里的 Markdown 格式说明」，那是另一套（`parse_mode`、转义规则），需要时可单独补一篇。*
