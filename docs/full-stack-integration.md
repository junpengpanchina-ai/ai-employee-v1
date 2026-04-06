# 全栈接通总清单（Supabase · Railway · Telegram · Vercel）

目标：把 **数据库 → 编排中枢 → Bot → Telegram → 管理后台** 按固定顺序接上线，避免「变量配了但链没通」。

```
Telegram ──► Railway bot-service ──► Railway orchestrator-service
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              GRSAI（模型）              Supabase（账本）          （可选）Vercel admin-web
                                                                         经 CORS 读 orchestrator /health 等
```

---

## 0. 变量放哪（总表）

| 变量 | Supabase | Railway · orchestrator | Railway · bot | Vercel · admin-web |
|------|----------|-------------------------|---------------|---------------------|
| 项目 URL | 控制台 | `SUPABASE_URL` | — | `NEXT_PUBLIC_SUPABASE_URL` |
| **Service role**（高权限） | — | `SUPABASE_SERVICE_ROLE_KEY` | **不要放** | **不要放** |
| **Publishable / anon** | — | — | — | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| GRSAI | — | `GRSAI_API_KEY` / `GRSAI_BASE_URL` / `GRSAI_COMPLETIONS_PATH` / `BOT_MODEL` | — | — |
| Telegram | — | — | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | — |
| 服务间地址 | — | （公网 URL 由 Railway 分配） | `ORCHESTRATOR_BASE_URL` = **orchestrator 的 https 根地址** | `NEXT_PUBLIC_API_BASE_URL` = **同上**（给浏览器里将来调 API 用） |
| 跨域 | — | `CORS_ORIGIN` = **Vercel 站点源**（如 `https://xxx.vercel.app`，无尾斜杠，多个逗号分隔） | — | — |
| 端口 | — | 使用 Railway 的 **`PORT`**（代码已优先读 `PORT`） | 同上 | — |

---

## 1. Supabase（先库，后服务）

1. 在 [Supabase](https://supabase.com) 创建项目。  
2. **SQL Editor** 中执行仓库 [`supabase-schema-v1.sql`](./supabase-schema-v1.sql)（四表：`employees` / `jobs` / `messages` / `reports`）。  
3. **Settings → API** 复制：  
   - **Project URL** → 填 orchestrator 的 `SUPABASE_URL` 与 Vercel 的 `NEXT_PUBLIC_SUPABASE_URL`  
   - **service_role** → **仅** orchestrator 的 `SUPABASE_SERVICE_ROLE_KEY`  
   - **anon / publishable** → **仅** Vercel 的 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

---

## 2. Railway：`orchestrator-service`（第二个接）

> **若构建报 Railpack / `start.sh not found`、且日志里根目录有 `apps/`、`docs/`：** 说明 Root Directory 还在**仓库根**，必须改成下面这一层，见 [`railway-minimal.md`](./railway-minimal.md) 故障速查。

1. **New Project → Deploy from GitHub**，选本仓库。  
2. **Add Service**（或第一个服务）→ 配置：  
   - **Root Directory**：`apps/orchestrator-service`  
   - **Start**：`npm start`（或 `node src/index.js`）  
3. **Variables**（示例）：  

   - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`  
   - `GRSAI_API_KEY`、`GRSAI_BASE_URL`、`GRSAI_COMPLETIONS_PATH`（如 `/chat/completions`）、`BOT_MODEL`  
   - `CORS_ORIGIN` = 你的 Vercel 地址，例如 `https://ai-employee-xxx.vercel.app`（**先填占位也可，Vercel 上线后再改并 Redeploy**）  
   - **不要**手动设 `PORT`（交给 Railway）  

4. Deploy 完成后，在 **Settings → Networking** 生成 **公网域名**，记为 **`ORCHESTRATOR_PUBLIC_URL`**（`https://....up.railway.app`，**无尾斜杠**）。

**自检：**

```bash
curl -sS "$ORCHESTRATOR_PUBLIC_URL/health"
```

应返回 `orchestrator-service` 的 JSON。

---

## 3. Railway：`bot-service`

1. **同一 Railway 项目** 再 **New Service** → 同一 GitHub 仓库。  
2. **Root Directory**：`apps/bot-service`  
3. **Variables**：  

   - `TELEGRAM_BOT_TOKEN`（BotFather）  
   - `TELEGRAM_WEBHOOK_SECRET`（自建随机串；与下文 `setWebhook` 的 `secret_token` 一致）  
   - `ORCHESTRATOR_BASE_URL` = **上一步的 `ORCHESTRATOR_PUBLIC_URL`**（**https，无尾斜杠**）  
   - `TELEGRAM_SEND_REPLY` = `true`（真要回 Telegram 时）  

4. Deploy 后得到 **`BOT_PUBLIC_URL`**。

**自检：**

```bash
curl -sS "$BOT_PUBLIC_URL/health"
```

---

## 4. Telegram：`setWebhook`

Webhook 必须是 **HTTPS**，指向 **bot-service** 公网地址：

- **URL**：`https://<BOT 域名>/telegram/webhook`  
- 若使用 secret：与 Railway 里 `TELEGRAM_WEBHOOK_SECRET` **完全一致**

**示例（把 `<TOKEN>`、URL、secret 换成你的）：**

```bash
curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<BOT_PUBLIC_HOST>/telegram/webhook" \
  -d "secret_token=<与 TELEGRAM_WEBHOOK_SECRET 相同>"
```

**自检：**

```bash
curl -sS "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

---

## 5. Vercel：`admin-web`

1. Import 本仓库，**Root Directory** = **`apps/admin-web`**（见 [`vercel-admin-web.md`](./vercel-admin-web.md)）。  
2. **Environment Variables**：  
   - `NEXT_PUBLIC_SUPABASE_URL`  
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  
   - `NEXT_PUBLIC_API_BASE_URL` = **`ORCHESTRATOR_PUBLIC_URL`**（与 bot 里 `ORCHESTRATOR_BASE_URL` 一致）  
3. Deploy 后打开 **`/`** 或 **`/ecosystem`**。

若日后在浏览器里 `fetch(NEXT_PUBLIC_API_BASE_URL + '/health')`，需保证 orchestrator 已配置 **`CORS_ORIGIN`** 包含该 Vercel 源。

---

## 6. 整体验收（建议按序打勾）

1. [ ] `curl orchestrator/health` 正常  
2. [ ] `curl bot/health` 正常  
3. [ ] `curl orchestrator/internal/ingest/telegram`（POST 测试体）返回 `reply_text`，且 Supabase `jobs` / `messages` 有记录  
4. [ ] Telegram 私聊发一句，能收到模型回复（且库里有对应记录）  
5. [ ] Vercel 站点能打开生态总览页；`NEXT_PUBLIC_*` 在页面上显示已配置（见 admin-web 顶栏）  

---

## 7. 代码侧已对齐的行为（无需你再改）

- Railway **监听 `0.0.0.0`**：两服务默认 `HOST=0.0.0.0`，容器外可访问。  
- **端口**：优先读环境变量 **`PORT`**（Railway 注入）。  
- **orchestrator CORS**：仅当设置 **`CORS_ORIGIN`** 时对浏览器返回跨域头；**bot → orchestrator 服务端 `fetch` 不受 CORS 限制**。

---

## 8. 相关文档

- 本地分层测试：[`local-testing.md`](./local-testing.md)  
- Railway 双服务：[`railway-minimal.md`](./railway-minimal.md)  
- Vercel 与 404 目录：[`vercel-admin-web.md`](./vercel-admin-web.md)、[`vercel-404-and-paths.md`](./vercel-404-and-paths.md)

当前阶段：**先按本文顺序接通，再扩 `/intel`、报表与后台深度页。**
