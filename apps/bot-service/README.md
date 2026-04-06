# bot-service

Telegram Webhook 入口服务。

负责：

- 接收 Telegram `webhook`
- 做可选 `secret` 校验
- 解析消息
- 转发到 `orchestrator-service`
- 根据 orchestrator 返回结果调用 Telegram `sendMessage`

## 职责边界

`bot-service` 只负责**入口与回传**，不负责：

- 模型推理
- 任务编排
- 数据库存储
- 报告生成

这些能力统一由 `orchestrator-service` 处理。

## 当前能力

- `GET /health`：健康检查
- `POST /telegram/webhook`：Telegram Webhook 入口
- 转发到 `ORCHESTRATOR_BASE_URL`
- 根据 `reply_text` 调用 Telegram `sendMessage`
- 支持通过 `TELEGRAM_SEND_REPLY=false` 关闭真实回发

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

默认端口：`BOT_SERVICE_PORT=8010`

启动后可检查：

```bash
curl http://localhost:8010/health
```

## 路由

### `GET /health`

健康检查。

返回示例：

```json
{
  "ok": true,
  "service": "bot-service",
  "time": "2026-04-06T12:00:00.000Z"
}
```

（`time` 为 ISO 8601 时间戳。）

### `POST /telegram/webhook`

Telegram Webhook 入口。

处理流程：

1. 校验 `x-telegram-bot-api-secret-token`（如果配置了 `TELEGRAM_WEBHOOK_SECRET`）
2. 解析 Telegram `message` / `edited_message`
3. 提取 `chatId`、`text`、`telegramUserId`
4. 转发到 `orchestrator-service`
5. 获取 `reply_text`
6. 如允许回发，则调用 Telegram Bot API `sendMessage`

## 关键环境变量

| 变量名 | 说明 |
|--------|------|
| `APP_ENV` | 运行环境，如 `local` / `development` / `production` |
| `LOG_LEVEL` | 日志级别，如 `info` / `debug` |
| `PORT` | Railway 等注入端口，优先于 `BOT_SERVICE_PORT` |
| `HOST` | 监听地址，默认 `0.0.0.0` |
| `BOT_SERVICE_PORT` | 本地默认建议 `8010` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram Webhook Secret，可选但建议配置 |
| `ORCHESTRATOR_BASE_URL` | orchestrator 服务地址 |
| `TELEGRAM_SEND_REPLY` | 是否真实回 Telegram，默认 `true` |

## 示例转发目标

本地示例：

```text
http://localhost:8001
```

生产环境应改为 Railway 内部服务地址或正式后端地址。

## 验收要点

最小验收链路：

1. `GET /health` 正常
2. Telegram webhook 能打到本服务
3. 本服务能转发到 orchestrator
4. orchestrator 能返回 `reply_text`
5. bot 能成功 `sendMessage`

## 注意事项

- `bot-service` 不保存业务账本
- 不要在这里直接写 Supabase
- 不要在这里直接调 GRSAI
- 所有业务中枢逻辑收敛到 `orchestrator-service`

## 后续可扩展

后续可增加但当前不抢跑：

- Telegram 命令路由增强
- Markdown 渲染保护
- 长文本分片发送
- 失败重试与告警
- `trace_id` 透传
