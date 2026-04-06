# 本地分层测试（Cursor / 终端）

目标不是「变量在不在控制台里」，而是验证三层：

1. **本地代码能读到环境变量**（且不泄露密钥）
2. **服务能正常启动**
3. **接口链路能打通**（health → orchestrator ingest → bot webhook）

对象拆分：**admin-web**、**bot-service**、**orchestrator-service** 分开测。

---

## 环境文件放哪（避免混用）

| 应用 | 本地密钥与配置 |
|------|----------------|
| `apps/admin-web` | `.env.local`（仅 `NEXT_PUBLIC_*`） |
| `apps/bot-service` | `.env` |
| `apps/orchestrator-service` | `.env` |

根目录 `.env` 容易与 app 内 `.env` 混淆；当前 **dotenv 只加载各 app 自己目录下的 `.env`**，请以对应 app 目录为准。

---

## 一、admin-web（前端变量）

### 1. 准备 `.env.local`

```bash
cd apps/admin-web
cp .env.example .env.local
```

填入（示例）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的_publishable_key
NEXT_PUBLIC_API_BASE_URL=https://你的后端或_orchestrator_公网地址
```

### 2. 启动

```bash
npm install
npm run dev
```

浏览器打开终端里提示的地址（一般为 `http://localhost:3000`）。

### 3. 验证读到了变量

打开浏览器 **开发者工具 → Console**。占位首页会在加载时打印：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 仅显示是否已设置（不打印完整 key）
- `NEXT_PUBLIC_API_BASE_URL`

若均为 `undefined`：检查 `.env.local` 是否在 **`apps/admin-web/`**、变量名是否 **`NEXT_PUBLIC_` 前缀**、修改后是否 **重启** `next dev`。

---

## 二、orchestrator-service

### 1. `.env`

见 `apps/orchestrator-service/.env.example`。

### 2. 启动与 health

```bash
cd apps/orchestrator-service
npm install
npm run dev
```

```bash
curl -s http://localhost:8001/health
```

期望：`ok: true`，`service: orchestrator-service`（可能另有 `time` 字段）。

### 3. 启动诊断（可选）

当 **`APP_ENV=local`** 或 **`LOG_LEVEL=debug`** 时，进程会在控制台打印**不含密钥**的摘要（如各 key 是否已设置）。

### 4. 直连 ingest（先不走 Telegram）

```bash
curl -s -X POST http://localhost:8001/internal/ingest/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "123456",
    "text": "你好，测试一下主链",
    "telegramUserId": "999999",
    "telegramUpdate": {}
  }'
```

说明：`bot-service` 转发时使用的是 **`telegramUpdate`**（完整 Telegram `update`）。手工 curl 可传空对象 `{}`；文档里若写作 `update`，服务端会忽略未知字段，不影响。

**通过标准：**

- JSON 里有 **`reply_text`**
- Supabase **`jobs`** 有一条从 `pending` 到终态的记录
- **`messages`** 有一条对应记录

---

## 三、bot-service

### 1. `.env`

建议联调 orchestrator 时先关真回 Telegram，避免误发：

```bash
TELEGRAM_SEND_REPLY=false
```

其余见 `apps/bot-service/.env.example`。

若配置了 **`TELEGRAM_WEBHOOK_SECRET`**，模拟 webhook 时必须在请求头带上：

`x-telegram-bot-api-secret-token: <与 .env 一致>`

若 **未配置** secret，则不要带该头。

### 2. 启动与 health

```bash
cd apps/bot-service
npm install
npm run dev
```

```bash
curl -s http://localhost:8010/health
```

（若本机 `8010` 被占用，可在 `.env` 里改 `BOT_SERVICE_PORT`。）

### 3. 模拟 Webhook

```bash
curl -s -X POST http://localhost:8010/telegram/webhook \
  -H "Content-Type: application/json" \
  -H "x-telegram-bot-api-secret-token: 你的TELEGRAM_WEBHOOK_SECRET" \
  -d '{
    "message": {
      "message_id": 1,
      "text": "测试bot转发",
      "chat": { "id": 123456 },
      "from": { "id": 999999, "is_bot": false, "first_name": "test" }
    }
  }'
```

**通过标准：**

- HTTP 200，JSON 里 **`orchestrator.reply_text`** 存在
- **`TELEGRAM_SEND_REPLY=false`** 时，`telegram` 多为跳过或说明未发送

---

## 四、推荐顺序（最稳）

1. 先起 **orchestrator**，再 **bot**（bot 依赖转发地址）。
2. `curl` **8001/health** → **8010/health**
3. **POST** orchestrator **`/internal/ingest/telegram`**
4. **POST** bot **`/telegram/webhook`**
5. 再开 **`TELEGRAM_SEND_REPLY=true`** 做 Telegram 真机验收

---

## 五、常见坑

- 改 **`.env` / `.env.local` 后必须重启** Node / Next 进程。
- **不要把** `TELEGRAM_BOT_TOKEN`、`GRSAI_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 放进前端。
- **端口**：默认 orchestrator **8001**，bot **8010**；部署环境若注入 **`PORT`**，两服务均已支持 **`PORT` 优先**。

---

## 六、整体验收口（4 条）

1. 两个后端 **health** 正常  
2. **orchestrator ingest** 返回 **`reply_text`**，且 Supabase **jobs / messages** 有账  
3. **bot webhook** 能转发并拿到 **`orchestrator.reply_text`**  
4. （可选）打开 **`TELEGRAM_SEND_REPLY`** 后，Telegram 里能收到模型回复  

满足 1–3 即主链在本地已跑通；第 4 为生产向验收。
