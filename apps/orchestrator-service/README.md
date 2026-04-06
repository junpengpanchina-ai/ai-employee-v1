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

返回示例（节选）：

```json
{
  "ok": true,
  "service": "orchestrator-service",
  "job_id": "...",
  "message_id": "...",
  "reply_text": "...",
  "grsai_error": null
}
```

## 关键环境变量

| 变量名 | 说明 |
|--------|------|
| `APP_ENV` | 运行环境 |
| `LOG_LEVEL` | 日志级别 |
| `ORCHESTRATOR_PORT` | 服务端口，默认建议 `8001` |
| `BOT_MODEL` | 默认模型名，如 `gemini-3.1-pro` |
| `GRSAI_API_KEY` | GRSAI API Key |
| `GRSAI_BASE_URL` | GRSAI 基础地址 |
| `GRSAI_COMPLETIONS_PATH` | OpenAI 兼容 completions 路径 |
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端高权限 Key |

## Supabase 当前落账范围

当前已接核心四表中的两条主线：

- `jobs`
- `messages`

后续 `/intel` 与报告能力再进一步接入：

- `reports`

员工注册表已存在：

- `employees`

## 验收要点

最小验收链路：

1. `GET /health` 正常
2. `POST /internal/ingest/telegram` 可接收消息
3. `callGRSAI()` 能返回模型结果
4. `jobs` 能从 `pending` 更新到 `succeeded` 或 `failed`
5. `messages` 有真实落账
6. 返回体中包含 `reply_text`

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
