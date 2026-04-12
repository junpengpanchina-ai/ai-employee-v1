import { callGRSAIWithSystem } from "./grsai.js";
import {
  INTEL_SYSTEM_PROMPT,
  buildIntelUserPrompt
} from "./intelPrompts.js";
import {
  fetchWorldMonitorFeed,
  formatIntelItemsForPrompt
} from "./worldmonitorFeed.js";

const NOT_CONFIGURED_REPLY = `情报源未配置。请在 orchestrator 环境变量中设置其一：
• WORLDMONITOR_INTEL_EXPORT_URL（推荐，指向返回 JSON 的导出地址）
• 或 WORLDMONITOR_PUBLIC_URL（将请求 …/api/export/intel）

详见仓库 docs/worldmonitor-plan.md、docs/worldmonitor-execution-checklist.md。`;

/**
 * Telegram /intel：拉取 WM 导出 → 总经理口径简报（GRSAI）。
 * @returns {Promise<{ replyText: string, grsaiSkipped: boolean }>}
 */
export async function runIntelBrief() {
  const feed = await fetchWorldMonitorFeed();
  if (!feed.configured) {
    return { replyText: NOT_CONFIGURED_REPLY, grsaiSkipped: true };
  }

  let block = formatIntelItemsForPrompt(feed.items);
  if (feed.fetchError) {
    const errShort = String(feed.fetchError).slice(0, 500);
    block = `（上游拉取异常：${errShort}）\n\n${block}`;
  }

  const userPrompt = buildIntelUserPrompt(block);
  const replyText = await callGRSAIWithSystem({
    systemContent: INTEL_SYSTEM_PROMPT,
    userText: userPrompt
  });
  return { replyText, grsaiSkipped: false };
}
