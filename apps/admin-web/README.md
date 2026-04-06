# admin-web

AI 员工公司 V1 的管理后台前端。

当前阶段定位：

- 老板视图
- 助理视图
- 员工页
- 任务页
- 报告页

> 注意：`admin-web` 当前仍处于待实现阶段。  
> 在 V1 阶段，它不是主链路核心，不承担消息入口、模型调用、账本写入或 worker 调度职责。

---

## 职责边界

`admin-web` 只负责**可视化管理与操作界面**，不负责：

- Telegram 消息接收
- GRSAI 模型调用
- Supabase 服务端高权限写入
- 后端任务编排
- 生产环境常驻运行逻辑

这些能力统一由后端服务承担：

- `bot-service`
- `orchestrator-service`

---

## 目标定位

### 老板视图

用于查看：

- 员工状态
- 最近任务
- 最近报告
- 关键运行状态

### 助理视图

用于执行非敏感操作：

- 失败任务重试
- 员工启停
- 报告审核与标记
- 模板维护（后续）

---

## 当前状态

| 区域 | 状态 | 说明 |
|------|------|------|
| 目录占位 | 已完成 | `apps/admin-web/` 已预留 |
| 页面实现 | 未开始 | 暂未进入开发 |
| 数据接入 | 未开始 | 暂未接 Supabase / API |
| 老板视图 | 未开始 | 后续实现 |
| 助理视图 | 未开始 | 后续实现 |

---

## 计划中的页面

### 1. 员工页

展示：

- 员工名称
- 岗位编码
- 当前状态
- 最近活跃时间
- 输出摘要（后续）

### 2. 任务页

展示：

- `jobs` 列表
- 任务状态
- 发起来源
- 失败原因
- 重试入口（后续）

### 3. 报告页

展示：

- `reports` 列表
- 报告类型
- 报告时间
- 审核状态
- 推送状态（后续）

### 4. 系统页（后续）

展示：

- 当前环境
- 服务健康状态
- 版本信息
- 关键配置只读视图（不暴露密钥）

---

## 数据来源原则

`admin-web` 仅读取：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_BASE_URL`

不允许放入前端：

- `TELEGRAM_BOT_TOKEN`
- `GRSAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- 任何后端高权限密钥

---

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

按本地或部署环境填写，不要提交真实密钥。

## 本地开发

```bash
cd apps/admin-web
cp .env.example .env.local
# 编辑 .env.local 填入 NEXT_PUBLIC_*
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`，在开发者工具 **Console** 中确认 `NEXT_PUBLIC_*` 已加载（详见 [`../../docs/local-testing.md`](../../docs/local-testing.md)）。

## 工程原则

- 前端只做展示与轻操作，不承担主脑职责
- 敏感变量不进入前端
- 后台开发顺序晚于主链稳定
- 主链不稳时，不抢跑后台复杂功能
- 页面先做最小可用，再逐步扩展老板/助理协作能力

## 当前严格顺序

1. 先完成 GRSAI 文档与线上配置对齐
2. 先稳定主链：Telegram → bot → orchestrator → Supabase → Telegram
3. 再做 `/intel` 与 `reports`
4. 最后再补 `admin-web`

## 后续里程碑

### V1 最小版

- 老板视图首页
- 员工页
- 任务页
- 报告页

### V1.5

- 助理视图
- 失败任务重试
- 报告审核状态
- 员工启停控制

### V2

- 部门视图
- 组织升级机制
- 权限系统
- 配置管理面板
