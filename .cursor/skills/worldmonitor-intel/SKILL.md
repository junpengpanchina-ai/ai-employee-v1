---
name: worldmonitor-intel
description: >-
  Explains the AI Employee intel loop: WorldMonitor as a continuous feed supply,
  orchestrator fetching and GRSAI summarization, bot delivering conclusions to the
  boss on Telegram. Use when the user mentions WorldMonitor, 资讯供料, 调取,
  机器人汇报, 情报闭环, /intel, or how news becomes a Telegram brief.
---

# WorldMonitor × 情报闭环（供料 → 加工 → 汇报）

## 架构事实（不要编造）

1. **WorldMonitor**（[koala73/worldmonitor](https://github.com/koala73/worldmonitor)）是 **资讯供给层**：地图、多源聚合、持续更新的情报；**不是**「直接告诉老板结论」的产品出口。
2. **本项目的老板出口**在 **Telegram**：**orchestrator** 负责 **调取**（阶段 B：API/RSS/库）+ **GRSAI 压成总经理口径**，**bot-service** 把 **「什么情况」** 发出去。
3. **admin-web「情报流」页** 用于团队看图 / 嵌入 WM，**辅助**主链；日常 **不以打开网页为唯一知情方式**。

**安全（必须遵守）**：**不得**向 WorldMonitor 进程、仓库或前端暴露 **`TELEGRAM_BOT_TOKEN`**、**`SUPABASE_SERVICE_ROLE_KEY`**、**`GRSAI_API_KEY`** 或本公司 **内部 `/internal` API 结构**。WM 使用 **独立** Railway 变量；机密只存在于 **bot-service / orchestrator**。调取情报时由 **orchestrator 主动**访问**公开或已脱敏**的数据源，而不是把密钥塞进 WM。

自动化调取尚未实现时，不要声称已接 WM 后端 API；可引导人工从 WM 界面摘要点，再按总经理短讯格式写给老板。

## 用户要「让机器人告诉我们什么情况」时

- **目标叙述**：先确认闭环——供料（WM）→ 调取与摘要（orchestrator）→ 投递（bot）→ 老板（Telegram）。
- **输出格式（给老板的短讯）**：
  - 一行结论（当前最值得盯什么）
  - 2～4 条要点（每条一句）
  - 可选：一句下一步
- **禁止**：虚构已部署的 `/intel` 接口；不要把 WM 页面内容冒充为系统自动抓取结果。

## 文档索引

- `docs/worldmonitor-plan.md` — **完整规划总览**（勾选路线图、变量表、安全）  
- `docs/worldmonitor-integration.md` — **情报闭环**与阶段 B  
- `docs/worldmonitor-railway.md` — Railway 部署 WM（供给层）  
- `docs/telegram-cursor-skill-guide.md` — Telegram 老板出口规范  
