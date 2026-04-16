# `/intel` 情报链路 — 当前状态与操作手册

> 最近更新：2026-04-16 · commit `1484d62` · deploy `edc73d82` Active

相关文档：
- 产品设计：[`worldmonitor-plan.md`](./worldmonitor-plan.md)
- 上线清单：[`worldmonitor-execution-checklist.md`](./worldmonitor-execution-checklist.md)
- 简报模板：[`intel-brief-template.md`](./intel-brief-template.md)
- WM 部署：[`worldmonitor-railway.md`](./worldmonitor-railway.md)
- WM 集成：[`worldmonitor-integration.md`](./worldmonitor-integration.md)

---

## 1. 现在这条链长什么样

```text
Telegram  ──▶  bot-service  ──▶  orchestrator-service
                                     │
                                     ├─ anyIntelSourceConfigured() 开关
                                     │
                                     ▼
                              ┌─ fetchIntelFeed() ─┐
                              │                    │
                              ▼                    ▼
                ①  WorldMonitor      ②  RSS/Atom/JSON Feed    ③  内置 mock
                   /api/export/intel    INTEL_FALLBACK_FEEDS     INTEL_ALLOW_MOCK
                   （官方站关闭，              （BBC / NYT …）         （5 条样本）
                    自建实例才可用）
                              │
              任一层命中 → items[]（统一 IntelItemRaw 形状）
                              │
                              ▼
            （可选）upsert wm_raw_items / intel_items    ←  供未来回溯
                              │
                              ▼
                     GRSAI（INTEL_SYSTEM_PROMPT）
                              │
                              ▼
                       结构化六段简报
                              │
                              ├─▶ 写 intel_briefs（审计）
                              │
                              ▼
                   bot-service  ──▶  Telegram
```

**优先级是 `WM → RSS → mock`**，任一层命中立即返回，不再向下尝试。
实际生效源会在 orchestrator 日志里打印一行：

```
[intel-feed] using worldmonitor   { count: N }
[intel-feed] using rss fallback    { count: N, errors: N }
[intel-feed] using built-in mock   { count: N }
```

---

## 2. 目前各层状态

| 层 | 状态 | 说明 |
|---|---|---|
| WorldMonitor 真实供料 | 不可用（既定） | `www.worldmonitor.app` 官方站**不对外开放** `/api/export/intel`，404 是它自己的 Next.js 404。需要自建 WM 实例才能用。 |
| RSS 兜底 | 未启用 | 只要在 Railway 配 `INTEL_FALLBACK_FEEDS` 就启用 |
| 内置 mock | ✅ 正在使用 | `INTEL_ALLOW_MOCK=true`，5 条带动态时间戳的示例 |
| orchestrator ↔ GRSAI | ✅ 正常 | `grsai_skipped: false, ok: true` |
| bot → orchestrator ingest | ✅ 正常 | `ingest_start / ingest done` 完整一轮 |
| `intel_briefs` 落账 | ✅ 工作中 | 每次 `/intel` 写一行（除非 `INTEL_PERSIST_BRIEFS=false`） |
| `intel_items` / `wm_raw_items` | ⚠️ 当前空 | mock 路径走 live_feed，不写这两张表；接入真实 WM 后才会有数据 |

---

## 3. Railway orchestrator-service Variables 建议

### 必需

| 变量 | 示例 | 作用 |
|---|---|---|
| `GRSAI_API_KEY` | `grsai_...` | 模型调用 |
| `GRSAI_BASE_URL` | `https://...` | 模型入口 |
| `SUPABASE_URL` | `https://xxx.supabase.co` | 账本 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciO...` | 账本写入 |
| `BOT_MODEL` | `gemini-3.1-pro` | 默认模型名 |

### 供料层（至少一项；推荐 1 + 3 组合做兜底）

| 变量 | 示例 | 作用 |
|---|---|---|
| `WORLDMONITOR_PUBLIC_URL` | `https://<你的 WM>.up.railway.app` | 自建 WM 根域，代码自动拼 `/api/export/intel`；**填官方站没用** |
| `WORLDMONITOR_INTEL_EXPORT_URL` | `https://<你的 WM>.../api/export/intel` | 直接指向完整导出 URL |
| `WORLDMONITOR_GATE_KEY` | `wm_abc123...` | 自托管 WM 的 `X-WorldMonitor-Key`，需与 WM 服务端 `WORLDMONITOR_VALID_KEYS` 中某一把一致 |
| `WORLDMONITOR_BEARER_TOKEN` | `sk_...` | 官方 api tier / 部分自建版本的 Bearer |
| `INTEL_FALLBACK_FEEDS` | `https://feeds.bbci.co.uk/news/world/rss.xml, https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml` | RSS / Atom / JSON Feed 列表，逗号/空白分隔；任一条失败不影响其它 |
| `INTEL_ALLOW_MOCK` | `true` | 全部真实源拿不到时用 5 条内置 mock 兜底（仅保证不降级） |

### 调优（全可选）

| 变量 | 默认 | 作用 |
|---|---|---|
| `INTEL_SINCE_HOURS` | `24` | 读库时间窗 |
| `INTEL_FEED_MAX_ITEMS` | `20` | 单次最多条数 |
| `INTEL_FEED_TIMEOUT_MS` | `20000` | 抓取超时 |
| `INTEL_MIN_IMPORTANCE` | `0` | 仅输出分数 ≥ 该阈值的条目，建议稳定后设 `70` |
| `INTEL_SYNC_ON_INTEL_IF_EMPTY` | `true` | 读库为空时先 sync 再读 |
| `INTEL_FALLBACK_LIVE_FETCH` | `true` | 读库仍空时现场抓（兼容未建表） |
| `INTEL_PERSIST_BRIEFS` | `true` | 每次简报落 `intel_briefs` |
| `ORCHESTRATOR_INTERNAL_SECRET` | *(空)* | 保护 `/internal/intel/sync` 与 `/internal/intel/brief` |

### 常见坑

- ❌ `WORLDMONITOR_PUBLIC_URL = https://www.worldmonitor.app/api/export/intel` — 官方站不开这个路径，永远 404
- ❌ 把 `wm_...` key 填进 URL 字段 — 代码会识别并拒绝
- ❌ 使用 `*.railway.internal` 但对应 service 没起或名字不对 — DNS 失败
- ✅ 私有网络 `.railway.internal` 必须用 `http://`，不是 `https://`（代码会自动修正 https→http）
- ✅ `WORLDMONITOR_PUBLIC_URL` / `_INTEL_EXPORT_URL` 中不小心多贴了一份 `/api/export/intel`，`collapseRepeatedExportSuffix` 会自动折叠

---

## 4. Telegram 命令一览

| 命令 | 含义 | 实现 |
|---|---|---|
| `/intel` | 默认窗口（24h）、全话题、全频道 | `intelArgs.parseIntelArgs` |
| `/intel 48h` | 指定时间窗 | 同上 |
| `/intel macro` | 按话题过滤（别名支持：`market→macro`） | `intelArgs.resolveTopicFilter` |
| `/intel 48h macro` | 时间窗 + 话题组合 | 同上 |

---

## 5. 内部运维接口

两个接口都位于 `src/routes/internalIntel.js`，由 `internalAuth.checkInternalSecret` 保护（若配了 `ORCHESTRATOR_INTERNAL_SECRET`，请求头需带 `X-Orchestrator-Secret`）。

### `POST /internal/intel/sync`

手动触发一次 WM → Supabase 同步，不调 GRSAI。

```bash
curl -X POST https://<orchestrator>/internal/intel/sync \
  -H "X-Orchestrator-Secret: $ORCHESTRATOR_INTERNAL_SECRET"
```

返回示例：

```json
{
  "ok": true,
  "fetched": 20,
  "stored": 17,
  "stored_raw": 20,
  "configured": true,
  "source": "rss",
  "fetchError": null
}
```

### `GET /internal/intel/brief`

调试用，端到端跑一遍（含 GRSAI）。

```bash
curl "https://<orchestrator>/internal/intel/brief?since_hours=24&topic=macro&channel=all" \
  -H "X-Orchestrator-Secret: $ORCHESTRATOR_INTERNAL_SECRET"
```

返回：`{ reply_text, meta }`。

---

## 6. Supabase 表职责

| 表 | 作用 | 关键列 |
|---|---|---|
| `wm_raw_items` | 供料原始行（JSON 快照） | `raw_id (unique)`, `payload_raw`, `content_hash`, `fetched_at` |
| `intel_items` | 标准化情报 | `dedupe_key (unique)`, `topic`, `signals`, `importance`, `raw_ref_id` |
| `intel_briefs` | 简报成品（老板视角审计） | `brief_id`, `mode (auto/manual)`, `since_hours`, `reply_text`, `source_item_ids`, `model_name` |

迁移文件：
- `supabase/migrations/20260415000000_intel_items.sql`
- `supabase/migrations/20260415120000_wm_raw_intel_briefs.sql`

---

## 7. 代码入口索引

| 文件 | 职责 |
|---|---|
| `src/intelFeed.js` | **统一供料入口**：WM → RSS → mock |
| `src/intelSources/rss.js` | RSS / Atom / JSON Feed 解析（零依赖） |
| `src/intelSources/mock.js` | 内置 5 条示例（动态时间戳） |
| `src/worldmonitorFeed.js` | WM 抓取、URL 规范化、路径去重 |
| `src/intelRun.js` | `runIntelBrief` 主链路（读库 → sync → GRSAI） |
| `src/intelArgs.js` | `/intel` 参数解析 |
| `src/intelPrompts.js` | `INTEL_SYSTEM_PROMPT`（AI 总经理五书合一） |
| `src/intelBriefSections.js` | 把 GRSAI 回复切成六段 |
| `src/intelDegraded.js` | 所有源都挂掉时的降级模板 |
| `src/internalAuth.js` | `checkInternalSecret` |
| `src/routes/internalIntel.js` | 内部 sync / brief 路由 |
| `src/adapters/worldmonitor/sync.js` | 抓取 → wm_raw → intel_items 流水线 |
| `src/adapters/worldmonitor/normalize.js` | 原始行 → intel_items 行（评分、打标签） |
| `src/adapters/worldmonitor/intelScoring.js` | 启发式 topic / signals / importance |
| `src/adapters/worldmonitor/intelPersist.js` | 把简报写入 `intel_briefs` |
| `src/adapters/worldmonitor/intelBriefsRepo.js` | intel_briefs 读写 |
| `src/adapters/worldmonitor/intelItemsRepo.js` | intel_items 读写 |
| `src/adapters/worldmonitor/wmRawRepo.js` | wm_raw_items 写入 |

文件路径全部相对 `apps/orchestrator-service/`。

---

## 8. 发一次 `/intel` 时 orchestrator 会打出哪些日志

成功走 mock（当前状态）：

```
[intel-feed] GET https://www.worldmonitor.app/api/export/intel { hasAuthorization: false, hasWorldMonitorKey: true }
[intel-feed] non-OK { url, status: 404, statusText: 'Not Found', bodyPreview: '{"error":...}' }
[intel-feed] using built-in mock { count: 5 }
[orchestrator] ingest_start { chatId, len, input_kind: 'command' }
[orchestrator] ingest done { jobId, messageId, input_kind: 'command', grsai_skipped: false, ok: true }
```

切到 RSS 后会变成：

```
[intel-feed] GET https://<your-wm>/api/export/intel ...
[intel-feed] non-OK / fetch failed
[intel-feed] using rss fallback { count: 20, errors: 0 }
[orchestrator] ingest done { ..., grsai_skipped: false, ok: true }
```

接入自建 WM 后会变成：

```
[intel-feed] GET https://<your-wm>.up.railway.app/api/export/intel { hasWorldMonitorKey: true }
[intel-feed] ok { url, status: 200, itemCount: 17 }
[intel-feed] using worldmonitor { count: 17 }
[orchestrator] ingest done { ..., grsai_skipped: false, ok: true }
```

---

## 9. 路线图

| 阶段 | 目标 | 关键动作 |
|---|---|---|
| ✅ 已完成 | `/intel` 端到端跑通，永不降级 | mock + RSS 兜底、`intel_briefs` 落账 |
| ⭐ 近期 | 换真实数据源 | 在 Railway 加 `INTEL_FALLBACK_FEEDS=<BBC, NYT, Reuters, ...>` |
| 中期 | 自建 WM 实例 | 新 Railway service → fork WM 源码 → `WORLDMONITOR_PUBLIC_URL` 指过去 |
| 中期 | 定时喂料 | Railway Cron 每 2–4h `POST /internal/intel/sync` |
| 中期 | 质量过滤 | `INTEL_MIN_IMPORTANCE=70`，只把高分条目喂给 GRSAI |
| 远期 | 多部门情报员 | 在 `intel_items.topic` 粒度上分发到不同的 GRSAI system prompt（宏观部 / 行业部 / 产品部） |
| 远期 | 主动推送 | `mode=auto` 简报每天固定时间主动 push 到 Telegram（不依赖 `/intel`） |

---

## 10. 当这套系统又"不响应"时，按这个顺序查

1. **Railway orchestrator 日志有没有 `[intel-feed] using …` 这一行**？
   - 没有 → 根本没走到 feed，检查 `anyIntelSourceConfigured()` 是否为 false（三个源一个都没配）
   - 有 → 走到哪层看源字段

2. **`ingest done` 的 `grsai_skipped` 是 `true` 还是 `false`**？
   - `true` → 没调 GRSAI，走了 NOT_CONFIGURED 或 DEGRADED 分支
   - `false` → GRSAI 真的被调了，看 `reply_text` 内容

3. **Telegram 收到的是"今日情报源暂不可用"的降级模板吗**？
   - 是 → 所有源都挂了，而且 `INTEL_ALLOW_MOCK` 没开
   - 否 → 实际内容基于 `meta.dataSource`（`live_feed:mock` / `live_feed:rss` / `intel_items`）

4. **Supabase `intel_briefs` 最近一行的 `generated_at`**
   - 有当前时间 → 落账成功，链路通
   - 没有 → `INTEL_PERSIST_BRIEFS=false` 关了，或 Supabase 写入失败（查 orchestrator 日志）
