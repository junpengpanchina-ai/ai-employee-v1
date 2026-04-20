/**
 * 从情报行生成 Telegram Inline「打开链接」按钮（每行一条，去重 URL）。
 */

const BTN_TEXT_MAX = 64;

/**
 * @param {unknown} u
 * @returns {boolean}
 */
export function isSafeHttpUrl(u) {
  const s = String(u ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const p = new URL(s);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {string} title
 * @param {string} url
 * @returns {{ text: string, url: string }}
 */
function makeButton(title, url) {
  let text = String(title || "").trim() || "链接";
  if (text.length > BTN_TEXT_MAX) {
    text = `${text.slice(0, BTN_TEXT_MAX - 1)}…`;
  }
  return { text, url: String(url).trim() };
}

/**
 * @param {unknown[]} items 含 title/name、url/link 的对象（intel_items 行或 feed item）
 * @param {number} maxButtons 0 则返回 []
 * @returns {{ text: string, url: string }[]}
 */
export function extractIntelUrlLinkButtons(items, maxButtons) {
  const cap = Math.min(10, Math.max(0, Math.floor(maxButtons)));
  if (cap <= 0 || !Array.isArray(items) || items.length === 0) return [];

  const seen = new Set();
  /** @type {{ text: string, url: string }[]} */
  const out = [];
  for (const row of items) {
    const o = row && typeof row === "object" ? row : {};
    const url = String(
      /** @type {{ url?: unknown, link?: unknown }} */ (o).url ??
        /** @type {{ link?: unknown }} */ (o).link ??
        ""
    ).trim();
    if (!isSafeHttpUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title =
      String(
        /** @type {{ title?: unknown, name?: unknown }} */ (o).title ??
          /** @type {{ name?: unknown }} */ (o).name ??
          ""
      ).trim() || url;
    out.push(makeButton(title, url));
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * @returns {number}
 */
export function getIntelTelegramLinkButtonsMax() {
  const n = Number(process.env.INTEL_TELEGRAM_LINK_BUTTONS_MAX ?? 6);
  if (!Number.isFinite(n) || n < 0) return 6;
  return Math.min(10, Math.floor(n));
}
