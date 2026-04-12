/**
 * WorldMonitor 供料：优先 JSON 导出 URL，否则用公网根拼 /api/export/intel。
 * 见 docs/worldmonitor-plan.md 取料契约。
 */

/** @typedef {{ title?: string, name?: string, source?: string, published_at?: string, summary?: string, url?: string, link?: string }} IntelItemRaw */

/**
 * 解析 orchestrator 环境变量，得到要请求的 URL；未配置则 null。
 * @returns {string | null}
 */
export function resolveIntelExportUrl() {
  const direct = (process.env.WORLDMONITOR_INTEL_EXPORT_URL || "").trim();
  if (direct) return direct.replace(/\/$/, "");
  const base = (process.env.WORLDMONITOR_PUBLIC_URL || "").trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/api/export/intel`;
}

/**
 * @param {IntelItemRaw} raw
 * @param {number} index
 * @returns {string}
 */
function formatOneItem(raw, index) {
  const title = raw.title || raw.name || `条目 ${index + 1}`;
  const lines = [`[${index + 1}]`, `标题：${title}`];
  if (raw.source) lines.push(`来源：${raw.source}`);
  if (raw.published_at) lines.push(`时间：${raw.published_at}`);
  const sum = raw.summary || raw.description;
  if (sum) lines.push(`摘要：${sum}`);
  const url = raw.url || raw.link;
  if (url) lines.push(`链接：${url}`);
  return lines.join("\n");
}

/**
 * @param {IntelItemRaw[]} items
 * @returns {string}
 */
export function formatIntelItemsForPrompt(items) {
  if (!items || items.length === 0) return "（暂无情报条目）";
  return items.map((it, i) => formatOneItem(it, i)).join("\n\n");
}

/**
 * @param {unknown} data
 * @returns {IntelItemRaw[]}
 */
function extractItemsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.intel)) return o.intel;
  }
  return [];
}

/**
 * @returns {Promise<{ configured: boolean, items: IntelItemRaw[], fetchError: string | null }>}
 */
export async function fetchWorldMonitorFeed() {
  const url = resolveIntelExportUrl();
  if (!url) {
    return { configured: false, items: [], fetchError: null };
  }

  const timeoutMs = Number(process.env.INTEL_FEED_TIMEOUT_MS || 20000);
  const maxItems = Math.min(
    100,
    Math.max(1, Number(process.env.INTEL_FEED_MAX_ITEMS || 20))
  );

  try {
    const ac = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac
    });
    if (!res.ok) {
      return {
        configured: true,
        items: [],
        fetchError: `HTTP ${res.status}`
      };
    }
    const data = await res.json().catch(() => null);
    if (data == null) {
      return {
        configured: true,
        items: [],
        fetchError: "响应不是合法 JSON"
      };
    }
    let items = extractItemsArray(data);
    items = items.slice(0, maxItems);
    return { configured: true, items, fetchError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { configured: true, items: [], fetchError: msg };
  }
}
