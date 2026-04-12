# WorldMonitor 接入执行清单（按当前架构）

> **用途**：Railway → Vercel → orchestrator → Telegram `/intel` → 验收，**逐项打勾**。  
> 战略与阶段总览见 [`worldmonitor-plan.md`](./worldmonitor-plan.md)；Railway 搜不到第三方仓库见 [`worldmonitor-railway.md`](./worldmonitor-railway.md) **§0**（需 **Fork** 后再部署）。

---

## 方法论约束（分析口径）

执行时把 WorldMonitor 当 **情报供给**，把 orchestrator 当 **压缩与定调**，输出要经得起下面视角（写在提示词里，不是口号）：

| 视角 | 怎么用 |
|------|--------|
| **资治通鉴** | 看大势与时机，不逆周期硬上 |
| **毛泽东选集** | 抓**主要矛盾**，同一阶段不打十个点 |
| **社会经济学** | 看信息、资源、分发链路怎么流 |
| **商业经营** | 看你在链上的**位置与控制权** |
| **投资框架** | 什么值得持续投入，什么先验证再加码 |

**当前主要矛盾**（接入期）：不是「情报不够多」，而是 **如何把上游情报压成老板可用的结论**。因此顺序必须是：**先供给层 → 再编排层 → 最后自动推送**。

**控制点**：WorldMonitor 不控制你方核心代码方向（外部供料）；**orchestrator + Telegram 口径 + Supabase 账本** 是你方核心位。**WM 只做料源，不做老板出口。**

---

## 一、战略判断（先读再打勾）

- [ ] **1.1** 明确目标：不是多一个资讯站，而是给 **AI 总经理** 增加稳定的 **情报供给层**
- [ ] **1.2** 链路共识：`WorldMonitor` → `orchestrator-service` → `bot-service` → `Telegram`（**不是** `WM → Telegram`）
- [ ] **1.3** 接受顺序：**先接供给层 → 再接编排层 → 最后才自动推送**

---

## 二、阶段总览

| 阶段 | 目标 |
|------|------|
| **A** | WorldMonitor 作为第三个 Service **能看、能访问、稳定跑** |
| **A.5** | admin-web **`/worldmonitor`** 团队可看板（非老板主出口） |
| **B** | orchestrator **手动**拉取 + **`/intel`**，总经理口径后再汇报 |
| **C** | 定时推送、**reports** 沉淀、后台历史（**满足门槛再做**） |

---

## 三、阶段 A：WorldMonitor 上线（Railway）

### A-1 原则

- [ ] **不改**现有 bot / orchestrator **主链语义**
- [ ] **不把** WM 并进本仓库 `apps/`
- [ ] **不把** `TELEGRAM_BOT_TOKEN`、`GRSAI_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 配进 WM

### A-2 本地（可选但推荐）

- [ ] Clone（建议 **Fork** 到自己账号后再 clone）：`https://github.com/<你>/worldmonitor`
- [ ] `npm install` / `npm ci`，`npm run dev`，浏览器确认能打开（默认 `:5173`）
- [ ] 确认：Vite 项目、`build` / `preview` 脚本存在；**记录**是否有 API / RSS / JSON 导出（供阶段 B）

### A-3 Railway

- [ ] **New Service** → GitHub 选 **你的 fork** `…/worldmonitor`（见 [`worldmonitor-railway.md`](./worldmonitor-railway.md) **§0**）
- [ ] **Root Directory**：留空
- [ ] **Build**：`npm ci && npm run build`
- [ ] **Start**：`npx vite preview --host 0.0.0.0 --port $PORT`
- [ ] **Networking**：生成公网域名，记为 **`WORLDMONITOR_PUBLIC_URL`**（`https://…`，无尾斜杠）
- [ ] 部署成功，服务 **Online**

### A-4 阶段 A 验收

- [ ] 浏览器能打开 `WORLDMONITOR_PUBLIC_URL`，**非白屏、非 404**
- [ ] Railway **Deployments / Logs** 无持续崩溃循环

### A-5 阶段 A 输出物

- [ ] 在线 **worldmonitor** Service
- [ ] 可访问的 **https 公网根**（供 orchestrator 阶段 B 取料、供 Vercel 嵌入）

---

## 四、阶段 A.5：admin-web（Vercel）

> **定位**：团队「情报作战室」观察面板；**不是**老板主决策出口（老板出口在 Telegram）。

### A5-1 变量

- [ ] Vercel **admin-web** 增加：`NEXT_PUBLIC_WORLDMONITOR_URL=https://<WORLDMONITOR_PUBLIC_URL>`（无尾斜杠）
- [ ] **Redeploy** Production（或 Preview）

### A5-2 页面（本仓库已具备，核对即可）

- [ ] 存在 `apps/admin-web/app/worldmonitor/page.js`
- [ ] 主导航可进 **`/worldmonitor`**
- [ ] 页头说明：**情报供给 / 非老板唯一出口**；**iframe** 优先，失败则**外链**

### A5-3 验收

- [ ] 打开 **`/worldmonitor`** 正常
- [ ] 能嵌入或能点击打开 WM；能确认 **WM 活着**

---

## 五、阶段 B：orchestrator 手动拉取 + `/intel`（核心）

### B-1 主要矛盾

- [ ] 从「很多信息」里筛出 **老板今天该知道什么**（准 > 多）

### B-2 先定取料契约（分水岭，未确认前先别大写代码）

按优先级排查并**只选一条主路**起步：

- [ ] **方式 1**：现成 **HTTP API**（JSON 列表，可鉴权或公开只读）
- [ ] **方式 2**：**RSS / Atom**
- [ ] **方式 3**：在 WM fork 增加轻量 **`GET /api/export/intel`**（最近 N 条 JSON）
- [ ] **方式 4**：抓页面 — **仅临时**，不作长期主路

> 将选定方式与 URL 记在团队内部（不必写进 WM 仓库 README 若涉内网）。

### B-3 orchestrator 能力（与设计对齐）

- [x] **`fetchWorldMonitorFeed()`**：`apps/orchestrator-service/src/worldmonitorFeed.js` — GET `WORLDMONITOR_INTEL_EXPORT_URL` 或 `WORLDMONITOR_PUBLIC_URL` + `/api/export/intel`，解析 JSON 数组或 `{ items }`；条数上限 `INTEL_FEED_MAX_ITEMS`
- [x] **简报生成**：`apps/orchestrator-service/src/intelRun.js` — `runIntelBrief()` = `buildIntelUserPrompt` + `callGRSAIWithSystem(INTEL_SYSTEM_PROMPT, …)`
- [x] **入口**：沿用 **`POST /internal/ingest/telegram`**，消息为 **`/intel`** 时走上述逻辑（**密钥仍在 orchestrator**）
- [x] **Telegram `/intel`**：bot 已转发 ingest；无需单独 HTTP 路由

> **配置**：orchestrator 需设置 `WORLDMONITOR_INTEL_EXPORT_URL` 或 `WORLDMONITOR_PUBLIC_URL`，否则回复「情报源未配置」说明。降噪/去重可后续加强。

### B-4 `/intel` 输出模板（六段 + 文档）

**完整说明、三档变体、五镜头、禁区**：[`intel-brief-template.md`](./intel-brief-template.md)

**默认六段结构（与 `INTEL_SYSTEM_PROMPT` 一致）**：

```text
今日情报简报

一、今日最重要的变化
二、主要矛盾
三、结构流向
四、竞争位置
五、与你的关系
六、今日动作
```

- [x] **GRSAI system/user 骨架**已写入 **`intelPrompts.js`**（接线 `summarizeIntel` 时直接引用）
- [ ] 取料契约确定后，将 **`buildIntelUserPrompt`** 接入真实 `summarizeIntel` 流程

### B-5 阶段 B 验收

- [ ] Telegram 发 **`/intel`**，收到 **完整六段简报**（或你们裁剪后的最短可用版）
- [ ] **WM 进程**仍 **无** 我方 Telegram/GRSAI/Supabase service role

---

## 六、阶段 C：自动推送与沉淀（最后）

**仅当同时满足再开做：**

- [ ] WM Service **稳定在线**
- [ ] `/worldmonitor` **稳定可看**
- [ ] **`/intel` 手动质量**稳定
- [ ] **老板入口口吻**已成熟

### C-1 自动化

- [ ] 定时拉取 → orchestrator 简报 → bot 推送 Telegram
- [ ] 结构化摘要写入 **`reports`**（若表结构已有）
- [ ] admin-web **历史简报**页（可选）

---

## 七、安全边界（再打勾一次）

**WM 永远不能持有：**

- [ ] 未在 WM 配置中出现：`TELEGRAM_BOT_TOKEN`
- [ ] 未在 WM 配置中出现：`SUPABASE_SERVICE_ROLE_KEY`
- [ ] 未在 WM 配置中出现：`GRSAI_API_KEY`
- [ ] 未向 WM 暴露 `/internal/*` 设计与鉴权细节

**只能放在 orchestrator（及受控后端）的：**

- [ ] 模型调用、高权限写库、情报摘要、**老板出口口径**

---

## 八、最值得投入的三点（投资视角）

- [ ] **数据契约**：稳定、低噪、可复用的取料方式（优先 API/RSS）
- [ ] **摘要口径**：多资讯 → **少数关键结论**（主要矛盾）
- [ ] **推送节奏**：何时值得打断老板（阶段 C 再定）

---

## 九、给 Cursor 的拆分任务（复制用）

**任务 1 — 阶段 A（Runbook）**  
按 `ai-employee-v1` 架构写 WM **独立 Railway 第三 Service**；不改 bot/orch 主链；Build/Start、`WORLDMONITOR_PUBLIC_URL`、验收。**输出**：可执行 Runbook（已部分覆盖 [`worldmonitor-railway.md`](./worldmonitor-railway.md)）。

**任务 2 — 阶段 A.5**  
admin-web **`/worldmonitor`**：`NEXT_PUBLIC_WORLDMONITOR_URL`、iframe 降级外链、说明非老板主出口。**输出**：`page.js`（本仓库**已有**，可改为补充文案）。

**任务 3 — 阶段 B**  
orchestrator：`fetchWorldMonitorFeed`、`summarizeIntel`、`/intel` 与路由设计；WM 仅供给层；**最小 diff**、表结构尽量不动。

**任务 4 — 趋势分析师口径**  
为 `/intel` 写 **system prompt + 示例**：融合 § 方法论五视角；中文、短、无推理过程、像老板汇报。

---

## 十、执行顺序总表（一句话）

| 顺序 | 内容 |
|------|------|
| **现在** | Railway WM Online → `WORLDMONITOR_PUBLIC_URL` → Vercel `/worldmonitor` |
| **接着** | 敲定 WM **取料契约** → orchestrator **`/intel`** → 手动质量稳定 |
| **最后** | 定时推送 → `reports` → 后台历史 |

---

## 十一、一句话判断

WorldMonitor **最正确的接法**是：先作为 **独立情报供给层**上线；等 **orchestrator** 能把它压成 **总经理口径** 后，再进入 **Telegram 主链**；**自动推送**永远排在 **`/intel` 手动跑通**之后。

---

*与 [`worldmonitor-plan.md`](./worldmonitor-plan.md)、[`worldmonitor-integration.md`](./worldmonitor-integration.md) 同步更新时：先改清单勾选与 B 段，再改长文，避免矛盾。*
