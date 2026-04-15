/**
 * 供料层失败时的固定降级（不调 GRSAI，避免浪费与不可控输出）。
 * 见 docs/worldmonitor-integration.md 情报闭环。
 */
export const INTEL_DEGRADED_REPLY = `今日情报简报

一、今日最重要的变化
当前情报源暂不可用，主链仍正常运行。

二、主要矛盾
供料层暂时无法拉取新数据，但 Telegram 与编排服务可用。

三、结构流向
暂无可靠的新增结构化情报入库。

四、竞争位置
优先保证系统稳定，而非追逐噪声信号。

五、与你的关系
你的总控层未依赖单一外部源；待供料恢复后可继续生成总经理口径简报。

六、今日动作
1. 检查 WorldMonitor 导出 URL 与密钥（WORLDMONITOR_INTEL_EXPORT_URL / GATE_KEY 等）
2. 在 Supabase 查看 intel_items 最近一次 captured_at
3. 必要时手动触发同步：POST /internal/intel/sync（需配置 ORCHESTRATOR_INTERNAL_SECRET 时带鉴权）`;

/** 写入 intel_briefs 时的结构化字段（与上文六段一致） */
export const DEGRADED_BRIEF_FIELDS = {
  top_change: "当前情报源暂不可用，主链仍正常运行。",
  primary_contradiction:
    "供料层暂时无法拉取新数据，但 Telegram 与编排服务可用。",
  structural_flow: "暂无可靠的新增结构化情报入库。",
  competitive_position: "优先保证系统稳定，而非追逐噪声信号。",
  relation_to_user:
    "你的总控层未依赖单一外部源；待供料恢复后可继续生成总经理口径简报。",
  actions: [
    "检查 WorldMonitor 导出 URL 与密钥（WORLDMONITOR_INTEL_EXPORT_URL / GATE_KEY 等）",
    "在 Supabase 查看 intel_items 最近一次 captured_at",
    "必要时手动触发同步：POST /internal/intel/sync（若配置了 ORCHESTRATOR_INTERNAL_SECRET 则带鉴权）"
  ]
};
