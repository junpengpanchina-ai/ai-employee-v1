/**
 * Telegram 老板出口：输入分类、固定短回复、最终文案清洗（不透出推理标签）。
 */

/** @typedef {"health_check"|"command"|"short_chat"|"manager_task"} InputKind */

/**
 * 去掉推理块与常见残留标签，再 trim；空则兜底短句。
 * @param {unknown} s
 * @returns {string}
 */
export function sanitizeReplyText(s) {
  let out = String(s ?? "");
  out = out.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, "");
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<\/?redacted_thinking>/gi, "");
  out = out.replace(/\bAssessing the input[^\n]*/gi, "");
  out = out.replace(/\bProcessing the input[^\n]*/gi, "");
  out = out.trim();
  if (!out) return "收到。请继续。";
  return out;
}

/**
 * @param {unknown} text
 * @returns {InputKind}
 */
export function classifyInput(text) {
  const raw = String(text ?? "");
  const t = raw.trim();
  if (!t) return "short_chat";
  if (t.startsWith("/")) return "command";

  const lower = t.toLowerCase();
  if (lower === "ping") return "health_check";
  if (t === "测试") return "health_check";
  if (t === "测试123") return "health_check";
  if (t === "123") return "health_check";
  if (t === "在吗" || t === "在吗?" || t === "在吗？") return "health_check";
  if (t === "." || t === "。") return "health_check";

  if (t.length <= 24) return "short_chat";
  return "manager_task";
}

/**
 * @param {unknown} text
 * @returns {string | null}
 */
export function fixedReplyHealthCheck(text) {
  const t = String(text ?? "").trim();
  const lower = t.toLowerCase();
  if (lower === "ping") return "pong";
  if (t === "测试") return "收到，链路正常。";
  if (t === "测试123") return "收到，测试通过。";
  if (t === "123") return "收到。";
  if (t === "在吗" || t === "在吗?" || t === "在吗？") return "在。请讲。";
  if (t === "." || t === "。") return "在。";
  return null;
}

/**
 * @param {unknown} text
 * @returns {string}
 */
export function fixedReplyCommand(text) {
  const t = String(text ?? "").trim();
  const cmd = t.split(/\s+/)[0].toLowerCase();
  switch (cmd) {
    case "/status":
      return "系统在线。bot / orchestrator 正常，等待新任务。";
    case "/intel":
    case "/money":
    case "/startup":
      return "该命令即将接入，请先用自然语言描述任务。";
    default:
      return "未知命令。需要时用自然语言说明即可。";
  }
}
