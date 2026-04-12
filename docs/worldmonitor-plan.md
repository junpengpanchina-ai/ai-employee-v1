# WorldMonitor × AI Employee：完整规划总览

> **用途**：一份文档看清 **定位、闭环、安全、部署、分阶段落地**；细节分册见文内链接。  
> **上游仓库**：[github.com/koala73/worldmonitor](https://github.com/koala73/worldmonitor)（**AGPL-3.0**，商业使用须单独合规）。

---

## 文档地图（本仓库内）

| 文档 | 内容 |
|------|------|
| **本文 `worldmonitor-plan.md`** | **规划总览**（路线图、取料契约、`/intel` 模板、附录任务拆分） |
| [`worldmonitor-execution-checklist.md`](./worldmonitor-execution-checklist.md) | **执行清单（逐项打勾）**：Railway / Vercel / B / 验收 + 方法论约束 |
| [`intel-brief-template.md`](./intel-brief-template.md) | `/intel` 六段模板、三档输出、五镜头、禁区；与 `intelPrompts.js` 对照 |
| [`worldmonitor-integration.md`](./worldmonitor-integration.md) | 情报闭环、安全边界、阶段说明 |
| [`worldmonitor-railway.md`](./worldmonitor-railway.md) | Railway 第三 Service 部署 WM（构建/启动命令） |
| [`telegram-cursor-skill-guide.md`](./telegram-cursor-skill-guide.md) | Telegram 与 Cursor Skill 总指引 |
| [`railway-integration-debug.md`](./railway-integration-debug.md) | bot / orchestrator 排障 Runbook |

---

## 0. 当前状态与总原则

**主链（Telegram → bot → orchestrator → GRSAI）已可接受**：出口口吻、健康检查与短回复已达标。

接下来接 WorldMonitor，务必按：

1. **先接「看板供给层」**（WM 独立可访问、团队能在 admin-web 看图）  
2. **再接「自动情报供料层」**（orchestrator 取料 → 摘要 → 经 bot 出口）

**不要一上来就做「自动推送老板」**；先 **手动 `/intel` 跑通质量**，再上定时。

---

## 1. WorldMonitor 在本套里的正确位置

**是：**

```text
WorldMonitor → orchestrator-service → bot-service → Telegram
```

**不是：**

```text
WorldMonitor → Telegram
```

| 层次 | 职责 |
|------|------|
| **WorldMonitor** | **资讯供给层**（看板、多源汇集） |
| **orchestrator-service** | **理解、筛选、压缩、定口径**（GRSAI、去重、排序） |
| **bot-service** | **只负责投递到 Telegram** |

**边界**：WM **不进** `apps/`；**Token 与内部 API 不向 WM 开放**（见 §3）。

---

## 2. 情报闭环（与 §1 一致）

```text
WorldMonitor（供给）
        │  orchestrator 主动取料（§7），非 WM 推 Telegram
        ▼
orchestrator-service（筛选 · GRSAI 总经理口径）
        ▼
bot-service → Telegram（老板知情出口）
```

- **admin-web `/worldmonitor`**：团队确认 WM **活着、有数据**；**辅助**，不是老板唯一出口。

---

## 3. 安全边界（硬规则）

| 机密 / 内部形态 | 仅存在于 | **禁止**出现在 WM |
|-----------------|----------|-------------------|
| `TELEGRAM_BOT_TOKEN` | bot-service | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY`、服务端写库 | orchestrator | ✓ |
| `GRSAI_API_KEY`、`/internal/*` 编排细节 | orchestrator | ✓ |
| 内部路由与鉴权 | 本 monorepo | ✓ |

**原则**：**orchestrator 主动向外拉**可公开或已授权的料；**不让 WM 直接决定老板看到什么**，更不让 WM 持有上述密钥。

---

## 4. 系统分工（部署拓扑）

| 组件 | 仓库 / 位置 | 典型托管 |
|------|-------------|----------|
| orchestrator-service | `ai-employee-v1` → `apps/orchestrator-service` | Railway |
| bot-service | `ai-employee-v1` → `apps/bot-service` | Railway |
| admin-web | `ai-employee-v1` → `apps/admin-web` | Vercel |
| **WorldMonitor** | **`koala73/worldmonitor`**（独立） | Railway 第三 Service |

规划里可把 WM 公网根记为 **`WORLDMONITOR_PUBLIC_URL`**（实施时写入 Vercel：`NEXT_PUBLIC_WORLDMONITOR_URL`，无尾斜杠）。

---

## 5. 分阶段路线图（推荐顺序）

### 阶段 A：先看板供给层（独立跑起来）

**目标**：WM 成为 **可访问、可看** 的情报面板。

| 代号 | 事项 | 勾选 |
|------|------|------|
| **A1** | 单独 clone `koala73/worldmonitor`，本地 `npm run dev` 能打开（默认 `:5173`） | [ ] |
| **A1** | Railway 第三个 Service，连接 WM 仓库；Root **留空**；Build `npm ci && npm run build`；Start `npx vite preview --host 0.0.0.0 --port $PORT` | [ ] |
| **A1** | 拿到 **`WORLDMONITOR_PUBLIC_URL`**（`https://….up.railway.app`），浏览器可访问 | [ ] |
| **A2** | Vercel 配置 `NEXT_PUBLIC_WORLDMONITOR_URL`，部署 **admin-web**，打开 **`/worldmonitor`**（iframe 或外链降级） | [ ] |
| **A** | 确认 WM Variables **无** 本公司 Telegram / GRSAI / Supabase service role | [ ] |

**阶段 A 不要做**：不接 Telegram 自动推送；不把机密给 WM；不让 WM 单独定义「老板看到什么」。

---

### 阶段 B：编排取料（先手动，后自动）

**目标**：**不是 WM 发消息**，而是 **orchestrator 去取 WM 的料**，再整理成总经理口径。

**分水岭（先做）**：搞清楚 **WorldMonitor 侧有无** 可供服务端调用的数据源（见 §6、§7）。没有 API/RSS 时，再选 fork 加轻量导出或临时方案。

| 代号 | 事项 | 勾选 |
|------|------|------|
| **B1** | 在 orchestrator 实现 **`fetchWorldMonitorFeed()`**（或等价）+ **`summarizeIntel()`**（GRSAI）；**手动触发**：Telegram **`/intel`** → bot 转发 → orchestrator 取料、摘要 → 回 Telegram | [ ] |
| **B1** | 取回内容侧：去重 / 聚类 / 重要性排序（按需求最小化） | [ ] |
| **B2** | 质量稳定后：**定时摘要**、可选写入 **`reports`**、与现有 `replyPolicy` 一致 | [ ] |

**当前代码**：`/intel` 已在 **`POST /internal/ingest/telegram`** 中走 **`runIntelBrief()`**（取料 + GRSAI 六段简报）；需在 orchestrator 配置 **`WORLDMONITOR_INTEL_EXPORT_URL` 或 `WORLDMONITOR_PUBLIC_URL`**，并在 WM 侧提供 **`GET …/api/export/intel`**（或专用导出 URL）返回 JSON（见 §6）。

---

### 阶段 C：自动推送老板（最后做）

**目标**：定时告诉老板「今天最该关注什么」。

| 事项 | 勾选 |
|------|------|
| 仅在 **B1/B2 输出质量稳定** 后启用 Cron / 队列推送 | [ ] |

---

### 研发协作（并行）

- [ ] 使用 [`.cursor/skills/worldmonitor-intel/SKILL.md`](../.cursor/skills/worldmonitor-intel/SKILL.md) 对齐话术与边界

---

## 6. 分水岭：先确认数据源

**接编码前必须先定**：orchestrator **从哪里**拿 WM 相关料？

| 优先级 | 方式 | 说明 |
|--------|------|------|
| **1** | 公开 HTTP API | 若有情报流/条目接口，最优 |
| **2** | RSS / Atom | 稳定、简单、不耦合前端 DOM |
| **3** | 你在 WM fork 里加轻量 **`GET /api/export/intel`**（JSON，最近 N 条） | 实用折中 |
| **4** | 抓页面 | **最后**；脆、维护成本高 |

---

## 7. orchestrator 侧待实现能力（命名供设计用）

- **`fetchWorldMonitorFeed()`**：按 §6 选定契约拉取原始条目。  
- **`summarizeIntel()`**：去重/排序（可选）→ GRSAI → 老板口吻简报。  
- **路由**：例如 `POST /internal/intel/run`（仅 bot 调）或与 Telegram `/intel` 共用 ingest 扩展；**实现时定**，**密钥只在 orchestrator**。

---

## 8. B1：Telegram `/intel` 与简报模板（手动版）

### 流程

1. 老板在 Telegram 发 **`/intel`**  
2. **bot-service** 转发 **orchestrator**  
3. **orchestrator**：`fetchWorldMonitorFeed` → 初筛 → **GRSAI** 按模板压缩  
4. **bot-service** 将 **`reply_text`** 发回 Telegram  

### 输出模板（示例，可贴进 prompt）

```text
今日情报简报

1. [事件]
一句话判断：为什么值得看

2. [事件]
一句话判断：对你有什么影响

3. [事件]
一句话判断：是否要跟进

今日动作：
优先盯第 1 条；若要展开，我继续拆给你。
```

要求与现有总经理设定一致：**中文、短、无推理标签外露**（见 `replyPolicy` + `grsai.js` system prompt）。

---

## 9. 明确不要做的事

1. **不要**把 WM 源码塞进本仓库 `apps/`（保持独立仓库）。  
2. **不要**给 WM：`TELEGRAM_BOT_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY`、`GRSAI_API_KEY`。  
3. **不要**让 WM **直接**向 Telegram 发消息；老板出口必须经过 **orchestrator**。  
4. **不要**跳过 B1 就上 **定时推送**。

---

## 10. Railway 部署 WM（摘要）

详见 [`worldmonitor-railway.md`](./worldmonitor-railway.md)。

1. New Service → `koala73/worldmonitor`，Root **空**。  
2. Build：`npm ci && npm run build`。  
3. Start：`npx vite preview --host 0.0.0.0 --port $PORT`。  
4. Networking → 公网 URL → 即 **`WORLDMONITOR_PUBLIC_URL`**。

---

## 11. 环境变量归属（防混用）

| 变量（示例） | bot | orchestrator | admin-web | WM |
|--------------|-----|----------------|-----------|-----|
| `TELEGRAM_BOT_TOKEN` | ✓ | ✗ | ✗ | ✗ |
| `ORCHESTRATOR_BASE_URL` | ✓ | ✗ | ✗ | ✗ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✗ | ✓ | ✗ | ✗ |
| `GRSAI_API_KEY` | ✗ | ✓ | ✗ | ✗ |
| `NEXT_PUBLIC_WORLDMONITOR_URL` | ✗ | ✗ | ✓（无密钥） | ✗ |
| orchestrator 侧 `WORLDMONITOR_*` 取料 URL（若需） | ✗ | ✓ | ✗ | ✗ |
| WM 自有变量 | ✗ | ✗ | ✗ | ✓ |

---

## 12. admin-web（Vercel）

- `NEXT_PUBLIC_WORLDMONITOR_URL=https://<WORLDMONITOR_PUBLIC_URL 无尾斜杠>`  
- 页面：**`/worldmonitor`**（已实现：说明 + iframe + 外链降级）

---

## 13. 合规

- **WorldMonitor**：**AGPL-3.0**，以法务意见为准。  
- **本 monorepo** 与 WM 许可证相互独立。

---

## 14. 代码与 Skill 路径（索引）

| 路径 | 说明 |
|------|------|
| `apps/admin-web/app/worldmonitor/page.js` | 情报流页（A2） |
| `apps/orchestrator-service/src/` | B1：`fetchWorldMonitorFeed`、`/intel` 等 |
| `apps/bot-service/src/index.js` | 转发；`/intel` 文本目前走 orchestrator ingest 需扩展时再接 |
| `.cursor/skills/worldmonitor-intel/SKILL.md` | Cursor 边界与话术 |

---

## 附录 A：拆给 Cursor 的三步（控制任务粒度）

### 第一步（阶段 A，已基本具备；可按 README 补齐）

> 为 WorldMonitor 落实阶段 A：**不改** bot/orchestrator 主链语义；WM 为 **独立 Railway 第三 Service**；admin-web 已有 **`/worldmonitor`** + `NEXT_PUBLIC_WORLDMONITOR_URL`；若 iframe 不可用则外链。

### 第二步（阶段 B1 设计 / 最小实现）

> 为 orchestrator 设计 **手动取料**：Telegram **`/intel`** → bot → orchestrator；WM 仅供给层；实现 **`fetchWorldMonitorFeed`（接口待依 §6 选定）**、**`summarizeIntel`**；最小返回结构贴合 §8；**不改库表除非必要**。

### 第三步（提示词）

> 为 `/intel` 简报定 **总经理口吻** system / user 模板：中文、短、无推理过程、含「今日重点 / 一句判断 / 建议动作」；给示例输入输出。

---

*变更规划时：先改本文 §5～§8，再同步 [`worldmonitor-integration.md`](./worldmonitor-integration.md) 的阶段描述。*
