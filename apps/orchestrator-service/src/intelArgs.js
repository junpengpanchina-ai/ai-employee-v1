/**
 * Telegram `/intel` 与调试接口参数解析。
 * 支持：`/intel`、`/intel 72h`、`/intel macro`（按 topic 过滤）等。
 */

const DEFAULT_HOURS = () =>
  Number(process.env.INTEL_SINCE_HOURS || 24);

/** 用户口语 → intel_items.topic */
export const TOPIC_ALIASES = {
  macro: "macro",
  market: "macro",
  宏观: "macro",
  geopolitics: "geopolitics",
  geo: "geopolitics",
  地缘: "geopolitics",
  startup: "startup",
  创业: "startup",
  tech: "tech",
  科技: "tech",
  general: "general"
};

/**
 * @param {unknown} text 完整消息，如 "/intel macro" 或 "/intel 48h"
 * @returns {{
 *   sinceHours: number,
 *   intelTopic: string | null,
 *   intelChannel: string
 * }}
 */
export function parseIntelArgs(text) {
  const t = String(text ?? "").trim();
  const rest = t.replace(/^\/intel\b/i, "").trim();

  if (!rest) {
    return {
      sinceHours: DEFAULT_HOURS(),
      intelTopic: null,
      intelChannel: "all"
    };
  }

  const hMatch = rest.match(/^(\d+)\s*h$/i);
  if (hMatch) {
    const h = Math.min(168, Math.max(1, parseInt(hMatch[1], 10)));
    return { sinceHours: h, intelTopic: null, intelChannel: "all" };
  }

  if (/^\d+$/.test(rest)) {
    const h = Math.min(168, Math.max(1, parseInt(rest, 10)));
    return { sinceHours: h, intelTopic: null, intelChannel: "all" };
  }

  const key = rest.split(/\s+/)[0].toLowerCase();
  const topic = TOPIC_ALIASES[key];
  if (topic) {
    return {
      sinceHours: DEFAULT_HOURS(),
      intelTopic: topic,
      intelChannel: "all"
    };
  }

  return {
    sinceHours: DEFAULT_HOURS(),
    intelTopic: null,
    intelChannel: rest.split(/\s+/)[0] || "all"
  };
}

/**
 * HTTP `?topic=` 与别名词 → intel_items.topic 列取值
 * @param {unknown} raw
 * @returns {string | null}
 */
export function resolveTopicFilter(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const key = String(raw).trim().toLowerCase().split(/\s+/)[0];
  return TOPIC_ALIASES[key] ?? key;
}
