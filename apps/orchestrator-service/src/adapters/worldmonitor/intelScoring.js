/**
 * 轻量启发式：topic / signals / 重要度（英文关键词为主，与上游 WM 英文摘要兼容）。
 */

/**
 * @param {number} n
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
function clampScore(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {{ title?: string, summary?: string }} item
 * @returns {number}
 */
export function scoreImportance(item) {
  let score = 60;
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  if (
    text.includes("oil") ||
    text.includes("yield") ||
    text.includes("inflation")
  ) {
    score += 10;
  }
  if (
    text.includes("war") ||
    text.includes("sanction") ||
    text.includes("shipping")
  ) {
    score += 10;
  }
  if (
    text.includes("capital") ||
    text.includes("funding") ||
    text.includes("flow")
  ) {
    score += 8;
  }
  return clampScore(score);
}

/**
 * @param {{ title?: string, summary?: string }} item
 * @returns {string}
 */
export function inferTopic(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  if (
    text.includes("oil") ||
    text.includes("yield") ||
    text.includes("inflation")
  ) {
    return "macro";
  }
  if (
    text.includes("war") ||
    text.includes("sanction") ||
    text.includes("border")
  ) {
    return "geopolitics";
  }
  if (
    text.includes("startup") ||
    text.includes("funding") ||
    text.includes("vc")
  ) {
    return "startup";
  }
  return "general";
}

/**
 * @param {{ title?: string, summary?: string }} item
 * @returns {string[]}
 */
export function inferSignals(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  /** @type {string[]} */
  const signals = [];
  if (text.includes("oil")) signals.push("oil_up");
  if (text.includes("yield")) signals.push("yield_up");
  if (text.includes("inflation")) signals.push("inflation_risk");
  if (text.includes("risk-off") || text.includes("selloff")) {
    signals.push("risk_off");
  }
  if (text.includes("capital") || text.includes("rotation")) {
    signals.push("capital_rotation");
  }
  if (text.includes("shipping")) signals.push("shipping_risk");
  return [...new Set(signals)];
}
