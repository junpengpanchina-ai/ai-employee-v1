# WorldMonitor 接入说明（[koala73/worldmonitor](https://github.com/koala73/worldmonitor)）

**规划总览**：[`worldmonitor-plan.md`](./worldmonitor-plan.md)　**执行清单（打勾）**：[`worldmonitor-execution-checklist.md`](./worldmonitor-execution-checklist.md)。

---

## 情报闭环（你要的产品形态）

**WorldMonitor 不负责「直接告诉老板什么情况」**——它提供的是 **持续、可视化的资讯与信号汇集**（地图、简报、多源聚合），相当于 **情报供给层**。

本项目的价值在 **后半段**：

```text
WorldMonitor（资讯源 / 可选旁挂看板）
        │
        ▼ 调取（HTTP API / RSS / 同步入库 · 阶段 B 实现）
orchestrator-service（理解、筛选、用 GRSAI 压成总经理口径）
        │
        ▼
bot-service → Telegram（把「当前判断与要点」告诉老板）
```

- **老板日常出口**：Telegram 上的 **短讯结论**（什么情况、要盯什么、下一步），而不是打开 WM 网页才算「收到情报」。
- **admin-web「情报流」页**：便于团队在后台 **看图 / 嵌入 WM**；与主闭环是 **辅助**，不是替代 bot。

---

## 它是什么

[WorldMonitor](https://github.com/koala73/worldmonitor) 是独立的 **实时全球情报看板**（Vite + TypeScript、地图与大量数据源），**不是**本 monorepo 里的子包。协议为 **AGPL-3.0**（商业用途须单独合规）。适合 **旁挂自托管**（例如 Railway 第三 Service），不把 WM 源码合并进 `apps/`。

官方文档：<https://www.worldmonitor.app/docs/documentation>。

---

## 与本项目的关系（分层）

| 层次 | 角色 |
|------|------|
| **WorldMonitor** | **资讯供给**：源源不断的情报与可视化；可选给团队做深度浏览 |
| **orchestrator（当前 + 阶段 B）** | **调取与加工**：从 WM 或中间存储取料 → GRSAI 摘要成「老板听得懂的一句/几条」 |
| **bot-service** | **投递**：把编排结果发到 Telegram |
| **admin-web** | **可选**：示意图、嵌入 WM、运维探测；不是老板唯一入口 |

阶段 B 要在 **orchestrator** 增加 **可取料的接口**（例如 **`/intel` 手动简报** → 再演进到定时任务），由它 **拉数据 → 模型 → `reply_text`**；**不要在 bot 里直接耦合 WM 前端**。

**推荐顺序（详表与勾选）**：见 **[`worldmonitor-plan.md`](./worldmonitor-plan.md)** — **A1/A2 看板供给 → B1 手动 `/intel` → B2 质量稳定后定时/入库 → C 自动推送老板**；不要跳过 B1 直接推送。

---

## 安全边界（硬规则）：机密不向 WorldMonitor 开放

**WorldMonitor 是第三方独立应用**，部署再近（同 Railway Project）也 **不能** 接触本公司的核心机密与内部接口形态。

| 不外泄给 WM | 说明 |
|-------------|------|
| **`TELEGRAM_BOT_TOKEN`** | 仅 **bot-service**；WM 进程、WM 前端 bundle **不得** 持有 |
| **`SUPABASE_SERVICE_ROLE_KEY`**、**服务端 DB 直连** | 仅 **orchestrator**（及受控后端）；WM **不得** 拿 service role |
| **`GRSAI_API_KEY`**、**内部 `ORCHESTRATOR_*` 路由** | 仅 **orchestrator**；WM 不调用带密钥的 GRSAI、不探测 `/internal/*` 细节 |
| **内部 API 结构**（路径、鉴权方式、账本字段） | **不对 WM 仓库暴露**；若阶段 B 要从 WM 取数，只使用 **orchestrator 主动发起的、对外公开的契约**（如公开 RSS、WM 若提供的无密钥只读端点），或 **由我方单独写的同步任务**把脱敏摘要写入中间存储 |

**原则**：密钥与 **「谁调谁」** 的架构图留在 **本 monorepo + Railway bot/orch 变量**；WM 只跑 **它自己的** 依赖与（若有）**它自己的** API Key。**方向是 orchestrator 向外拉可公开或已授权的数据，而不是把机密塞进 WM。**

---

## 阶段规划（摘要）

完整路线、取料契约优先级、`/intel` 模板与 **附录（拆给 Cursor 的三步）** 见 **[`worldmonitor-plan.md`](./worldmonitor-plan.md)**。

| 阶段 | 做什么 |
|------|--------|
| **A1/A2** | WM **独立** Railway 跑通；admin-web **`/worldmonitor`** 可看图（iframe/外链）；**不接**自动推老板 |
| **B1** | orchestrator **主动取料** + **Telegram `/intel` 手动简报**；质量优先 |
| **B2** | 定时摘要、可选 **`reports`** |
| **C** | **自动推送老板**（最后做） |

并行： **`.cursor/skills/worldmonitor-intel/SKILL.md`** 对齐话术与边界。

### 阶段 A 操作入口

**生产推荐：Railway 第三 Service**，详见 **[`worldmonitor-railway.md`](./worldmonitor-railway.md)**。

1. 本地：`npm run dev`（默认 <http://localhost:5173>）。
2. 线上：WM 公网根 → Vercel `NEXT_PUBLIC_WORLDMONITOR_URL` → **`/worldmonitor`**。

---

## 合规与运维提示

- **许可证**：fork/改 WM 须遵守 **AGPL-3.0**；仅链接自托管实例时请保留合规与署名要求，**以法务意见为准**。
- **密钥**：WM 与 **GRSAI / Supabase** 分属不同 Service，变量勿混用。
- **嵌入**：部分响应头禁止 iframe 时，老板仍以 **Telegram 结论** 为主，WM 页面为辅助。

---

## 相关路径

| 路径 | 说明 |
|------|------|
| `apps/admin-web/app/worldmonitor/page.js` | 后台「情报流」主链示意图 |
| `.cursor/skills/worldmonitor-intel/SKILL.md` | 时效情报汇报 Skill |
| `docs/telegram-cursor-skill-guide.md` | Telegram 与 Cursor Skill 总指引 |
| [`worldmonitor-railway.md`](./worldmonitor-railway.md) | **在 Railway 部署 WM**（第三 Service、构建/启动命令） |
| [`worldmonitor-plan.md`](./worldmonitor-plan.md) | **完整规划总览**（闭环、安全、分阶段勾选、变量表） |
