# 在 Vercel 部署 `admin-web`（生产）

本仓库是 **monorepo**，Next.js 应用在 **`apps/admin-web`**。在 Vercel 里必须把 **Root Directory** 指到该目录，否则会找不到 `package.json` / 构建失败。

---

## 一、Dashboard 部署（推荐）

### 1. 新建项目并关联 GitHub

1. 打开 [Vercel Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project**。  
2. **Import** 仓库 `ai-employee-v1`（需已推送到 GitHub 并授权 Vercel 读取）。

### 2. 配置构建设置（关键）

在 **Configure Project** 页面：

| 项 | 值 |
|----|-----|
| **Framework Preset** | **Next.js**（若显示 **Other**，不会执行 `next build`，易出现 **Ready 但 404**、构建仅数秒） |
| **Root Directory** | 在 **Settings → Build and Deployment**，填 **`apps/admin-web`** |
| **Build Command** | 留空使用默认，或 `npm run build` |
| **Install Command** | 留空使用默认，或 `npm install` |
| **Output Directory** | Next.js 由平台处理，**不要**手填 `dist` |

保存后继续。

### 3. 环境变量（Production / Preview）

在 **Settings → Environment Variables** 中为 **Production**（需要的话再加 **Preview**）添加：

| 变量名 | 说明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 仅 **anon / publishable**，勿放 service role |
| `NEXT_PUBLIC_API_BASE_URL` | 后端公网地址，例如 Railway 上 **orchestrator-service** 的 `https://xxx.up.railway.app`（**无尾斜杠**） |

保存后 **Redeploy** 一次，否则旧构建读不到新变量。

### 4. 部署与访问

完成首次 **Deploy** 后，使用 Vercel 提供的域名访问；根路径 `/` 会重定向到 **`/ecosystem`** 生态总览页。  
运维上可在 **`/ops`** 查看 Vercel 服务端对 **`NEXT_PUBLIC_API_BASE_URL/health`** 的探测结果（用于核对 orchestrator 公网地址，不经浏览器 CORS）。

**若浏览器出现 `404: NOT_FOUND`（页面里带 `Code: NOT_FOUND` 与 `sfo1::…` 这类 ID）：**

这通常是 **Vercel 没把你的站点当成 Next 应用跑起来**（边缘层找不到应用），而不是「少写了一页」。

更系统的「三种目录」对照与排查顺序见 **[`vercel-404-and-paths.md`](./vercel-404-and-paths.md)**。此处保留最短自查：

1. **Settings → General → Root Directory** 必须是 **`apps/admin-web`**（不要留空、不要只填仓库根）。改完后 **Redeploy**。  
2. **Settings → General → Framework Preset** 应为 **Next.js**；**Output Directory** 必须 **留空**（不要填 `dist` / `.next`）。  
3. 在部署的域名后 **手动访问** `https://你的域名/ecosystem` 试一次。若 **`/ecosystem` 也 NOT_FOUND**，几乎可以断定仍是 Root Directory / 构建类型问题。  
4. 打开该次部署的 **Build Logs**，确认出现 **Next.js** 构建与 `Route (app)` 汇总，而不是「空目录」或其它框架。

---

## 二、CLI 部署（可选）

已安装 [Vercel CLI](https://vercel.com/docs/cli) 并登录后：

```bash
cd apps/admin-web
vercel        # 预览
vercel --prod # 生产
```

首次会提示 **Link** 到已有项目或新建；确保该 Vercel 项目的 **Root Directory** 在网页后台仍设为 `apps/admin-web`（与 CLI 在子目录执行一致）。

---

## 三、常见问题

| 现象 | 处理 |
|------|------|
| **Root 已是 `apps/admin-web` 仍 404**，构建只要 **几秒** | **Framework Preset** 误为 **Other** → 改为 **Next.js**，**Save** 后 **Redeploy**；Build Logs 应出现 `next build` 与 `Route (app)` |
| Build: Cannot find module / no package.json | Root Directory 未设为 **`apps/admin-web`** |
| 页面里 `NEXT_PUBLIC_*` 全是未配置 | 变量未加在 Vercel，或加完未 **Redeploy** |
| API 调不通 | 检查 `NEXT_PUBLIC_API_BASE_URL` 是否为 **公网 HTTPS**，且 CORS（若从前端直连）已由后端配置 |
| 以后要引用 `packages/*` | 在 **Build and Deployment** 里 **Root Directory** 旁开启 **Include files outside the root directory in the Build Step**（按需） |

---

## 四、与 Railway 的关系

- **Vercel**：只承载 **admin-web** 静态/SSR 前端。  
- **Railway**：**bot-service**、**orchestrator-service**。  
- `NEXT_PUBLIC_API_BASE_URL` 应指向 **可在浏览器里访问的 orchestrator 公网地址**（若暂只做生态总览、不调 API，可先填占位，但变量建议与真实后端一致以免后续踩坑）。

更多本地与线上联调见 [`local-testing.md`](./local-testing.md)、[`railway-minimal.md`](./railway-minimal.md)。
