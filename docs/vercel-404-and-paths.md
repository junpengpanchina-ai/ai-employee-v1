# Vercel 404 与「目录」怎么梳理

404 时容易把 **三种完全不同的“目录”** 混在一起。先分开，再按表排查。

---

## 三种目录，不要混

| 层次 | 是什么 | 你该看什么 | 和 404 的关系 |
|------|--------|------------|----------------|
| **① 仓库里的路径** | Git 里的文件夹，例如 `apps/admin-web/app/ecosystem/page.js` | 本地 Finder / Cursor 左侧树 | 只决定 **Next 里哪个路由存在**；**不**决定 Vercel 会不会部署到 Next |
| **② Vercel 的 Root Directory** | Dashboard 里配的「从哪一层开始当项目根」 | **Settings → General → Root Directory** | **配错时整站容易 `NOT_FOUND`**，和你在浏览器里访问 `/ecosystem` 无关——因为应用根本没按 Next 跑起来 |
| **③ 浏览器里的 URL 路径** | 地址栏里 `/`、`/ecosystem` | 你实际打开的链接 | Next App Router：`app/ecosystem/page.js` → **`/ecosystem`**；`app/page.js` → **`/`** |

**一句话：**  
- **② 错了** → 常见是整页 Vercel 的 `404: NOT_FOUND`（带 `sfo1::…` 那种）。  
- **② 对了、③ 错了** → 才是 Next 自己的 404（一般是你们熟悉的 Next 风格页面，或 `not-found`）。

---

## 本仓库 admin-web：① 和 ③ 的对应关系

在 **① 的根 = `apps/admin-web`** 的前提下（也就是 ② 必须设成这个）：

| 仓库路径（简写） | 浏览器路径 ③ |
|------------------|--------------|
| `app/page.js` | `/`（并会跳到 `/ecosystem`，见 `middleware` / `next.config`） |
| `app/ecosystem/page.js` | `/ecosystem` |

没有 `app/foo/page.js` 就没有 `/foo`——这是 **③ 层面** 的 404。

---

## 404 时建议的梳理顺序（按这个做，不跳步）

### 第一步：先判断是哪一种 404

1. 页面上是否出现 **`404: NOT_FOUND`**，且带 **`Code: NOT_FOUND`**、**`sfo1::…`** 这类 **Vercel 文案**？  
   - **是** → 优先按 **② Vercel Root Directory / 构建类型** 查（下面第二步）。  
   - **否** → 才是 **③ 路由是否真有这个页面**（路径拼错、没写 `page.js` 等）。

### 第二步（Vercel 整站 NOT_FOUND 时）：只查 ②，不要先猜 ①

在 Vercel **同一个 Project** 里打开：

1. **Settings → General → Root Directory**  
   - 必须是 **`apps/admin-web`**（与仓库里 Next 的 `package.json` 同级那一层）。  
   - **不要**用仓库根（没有 Next 的那一层当“项目根”）。
2. **Settings → General → Output Directory**  
   - Next.js：**留空**。不要填 `dist`、不要手填 `.next`。
3. **Deployments → 点进最近一次 → Build Logs**  
   - 应能看到 **Next.js** 构建、`Route (app)` 一类输出。  
   - 若像「没跑 next build」或根目录不对，先改 **②** 再 **Redeploy**。

### 第三步：再确认 ③

在浏览器里**显式打开**（把域名换成你的）：

- `https://<你的域名>/ecosystem`

若 **② 已正确**、构建成功，这里应能打开生态总览。  
若只有 `/` 有问题，再看 **Redeploy** 是否已包含最新的 `middleware` / `redirects`（见仓库 `apps/admin-web`）。

### 第四步：仍迷惑时，对照「我到底部署的是哪一层」

心里默念这句：

> Vercel 的 **Root Directory**，必须指向 **含有 `next.config.mjs` 和 `package.json` 的那一层**。  
> 在本仓库里，这一层就是 **`apps/admin-web`**，**不是** 仓库最外层。

---

## 常见误操作（避免）

| 误操作 | 结果 |
|--------|------|
| Root Directory 留空 = 仓库根 | 往往 **NOT_FOUND** 或构建不对 |
| 填成 `apps`（少一层 `admin-web`） | 构建仍可能对不上 |
| 填了 **Output Directory** | Next 在 Vercel 上容易异常 |
| 开了两个 Project，一个指根、一个指 `admin-web`，却打开了错的域名 | **看起来 404**，其实是另一个没部署好的项目 |

---

## 和别的文档的关系

- 逐步点按钮部署：[`vercel-admin-web.md`](./vercel-admin-web.md)  
- 本地怎么跑同一套路由：[`local-testing.md`](./local-testing.md)

当前阶段口径：**先保证 ② 正确，再谈 ③ 扩展新页面。**
