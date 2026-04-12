# 在 Railway 部署 WorldMonitor（与 bot / orchestrator 并列）

**规划总览**：[`worldmonitor-plan.md`](./worldmonitor-plan.md)。

WorldMonitor 源码在 **独立仓库** [github.com/koala73/worldmonitor](https://github.com/koala73/worldmonitor)，**不要**放进本 monorepo 的 `apps/`。在 Railway 上应作为 **第三个 Service**（或单独 Project），与 `bot-service`、`orchestrator-service` **共用同一 Railway Project** 即可，方便统一域名与账单。

**安全**：与 bot / orchestrator **分开 Service Variables**。**勿**把 `TELEGRAM_BOT_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY`、`GRSAI_API_KEY` 或内部 `/internal` 鉴权信息配进 WM。详见 [`worldmonitor-integration.md`](./worldmonitor-integration.md) **「安全边界」**。

---

## 0. Railway 里搜不到 `koala73/worldmonitor`？（常见）

Railway 的 **GitHub 搜索框只会列出：当前已连接的 GitHub 账号有权访问的仓库**（且需在 Railway GitHub App 的授权范围内）。**别人的仓库**若不在你的名下，往往 **搜不到**，并提示 *No repositories found*。

**推荐做法（最省事）**：

1. 在浏览器打开 [github.com/koala73/worldmonitor](https://github.com/koala73/worldmonitor)，点右上角 **Fork**，把仓库 **fork 到你自己的 GitHub 账号**（或你们公司的 Org）。
2. 等 fork 完成后，回到 Railway → **New Service** → **GitHub Repo**，搜索 **`你的用户名/worldmonitor`**（或 `组织名/worldmonitor`）。
3. 若仍没有：到 **GitHub → Settings → Applications → Installed GitHub Apps → Railway → Configure**，把 **Repository access** 设为能访问该 fork（例如 *All repositories* 或 **仅勾选** 这个 fork）。保存后回到 Railway **刷新仓库列表** 再搜。

**说明**：用 fork 部署 AGPL 项目仍须遵守 **许可证与署名**；后续上游更新可通过 **Sync fork** 合并。

**备选**（不依赖网页里搜第三方仓库）：

- 本地 `git clone` 你的 fork，安装 [Railway CLI](https://docs.railway.app/develop/cli)，在项目目录 `railway link` 绑定到目标 Project/Service，用 CLI 触发部署（与面板等价，仍建议源码在 **你的 GitHub fork** 上便于持续部署）。

---

## 1. 新建 Service

1. 打开 Railway → 你的 **Project**（与 AI Employee 双服务同一项目即可）。
2. **New** → **GitHub Repo** → 选择 **你 fork 的 `…/worldmonitor`**（见 **§0**；不要依赖能直接搜到 `koala73/worldmonitor`）。
3. **Settings → Source**
   - **Root Directory**：留空（仓库根目录即 WM 工程根）。
   - Branch：通常 **`main`**。

---

## 2. 构建与启动（Nixpacks / Railpack 通用思路）

官方脚本（见对方 `package.json`）：

- **构建**：`npm ci` 后执行 **`npm run build`**（内含 `build:blog`、`tsc`、`vite build`，首次可能较久）。
- **生产预览**：使用 Vite 的 **`vite preview`** 提供 `dist/`，并监听 **`PORT`**（Railway 注入）。

在 **Service → Settings → Deploy** 中可自定义（若自动检测不对时）：

| 字段 | 建议值 |
|------|--------|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npx vite preview --host 0.0.0.0 --port $PORT` |

说明：

- **`--host 0.0.0.0`**：容器外可访问，否则 Railway 健康检查可能失败。
- **`$PORT`**：必须与 Railway 注入端口一致（勿写死 5173；5173 是本地 `vite dev` 默认）。

若 **`npm run build` 内存不足**，可在 Variables 中尝试提高 Node 老生代上限（名称因构建器而异），或查阅 Railway 文档调大 Builder 内存；仍失败则需对照 [WM 官方 self-hosting](https://www.worldmonitor.app/docs/getting-started) 或考虑 Docker 部署。

---

## 3. 公网域名

1. **Networking → Generate Domain**，得到 `https://<worldmonitor>.up.railway.app`。
2. 浏览器打开该地址，确认地图页可加载。

---

## 4. 接回 admin-web（Vercel）

在 **Vercel** 上部署的 `admin-web` 环境变量中设置：

```bash
NEXT_PUBLIC_WORLDMONITOR_URL=https://<上一步的 WM 公网根，无尾斜杠>
```

重新部署 admin-web 后，打开 **`/worldmonitor`**：

- 若 WM 响应头允许嵌入，可出现 **iframe**；
- 若出现空白（常见：`X-Frame-Options` 限制），使用页面上的 **「打开已配置的实例」** 外链即可。

---

## 5. 与本项目其他服务的关系

| Railway Service | 仓库 | 作用 |
|-----------------|------|------|
| `orchestrator-service` | `ai-employee-v1` → `apps/orchestrator-service` | 编排 / GRSAI / Supabase |
| `bot-service` | `ai-employee-v1` → `apps/bot-service` | Telegram Webhook |
| **worldmonitor**（建议名） | **`koala73/worldmonitor`** | 情报看板，仅人类浏览或未来 `/intel` 数据源 |

**环境变量不要混用**：WM 自有依赖与 API Key（若有）放在 WM 的 Service Variables；`ORCHESTRATOR_BASE_URL` 等仍在 bot/orchestrator 上。

---

## 6. 许可证

WorldMonitor 为 **AGPL-3.0**。商业使用须遵守对方许可；部署在 Railway 自托管用于团队内网/老板入口，一般仍属「自托管」范畴，**以法务结论为准**。

---

## 7. 和「机器人告诉老板」的关系

在 Railway 部署 WM，只是让 **资讯供给层** 在线可访问（团队可看板、阶段 B 可 **从同域或 API 调取**）。**向老板说明「什么情况」** 仍由本仓库的 **orchestrator + bot → Telegram** 完成，见 [`worldmonitor-integration.md`](./worldmonitor-integration.md) 开头的情报闭环。

---

## 8. 相关文档

- [`worldmonitor-integration.md`](./worldmonitor-integration.md) — **供料 → 调取 → 汇报** 总览与阶段 B
- [`railway-minimal.md`](./railway-minimal.md) — 本 monorepo 双服务 Railway 习惯
