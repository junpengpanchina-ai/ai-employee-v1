/**
 * 统一情报供料入口：WM → RSS/Atom → 内置 mock 的有序尝试。
 * 返回值兼容 fetchWorldMonitorFeed（{ configured, items, fetchError }），
 * 使 sync.js / intelRun.js 的调用方无需大改。
 */

import {
  fetchWorldMonitorFeed,
  resolveIntelExportUrl,
} from "./worldmonitorFeed.js";
import { fetchFallbackRssFeeds } from "./intelSources/rss.js";
import { buildMockIntelItems } from "./intelSources/mock.js";

/** @typedef {import("./worldmonitorFeed.js").IntelItemRaw} IntelItemRaw */

/**
 * @returns {boolean}
 */
function isMockAllowed() {
  const v = (process.env.INTEL_ALLOW_MOCK || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @returns {boolean}
 */
function hasRssFallback() {
  return Boolean((process.env.INTEL_FALLBACK_FEEDS || "").trim());
}

/**
 * 是否配置了至少一种供料源。
 * @returns {boolean}
 */
export function anyIntelSourceConfigured() {
  return (
    Boolean(resolveIntelExportUrl()) || hasRssFallback() || isMockAllowed()
  );
}

/**
 * @param {number} maxItems
 * @param {IntelItemRaw[]} items
 * @returns {IntelItemRaw[]}
 */
function capItems(maxItems, items) {
  if (!Number.isFinite(maxItems) || maxItems <= 0) return items;
  return items.slice(0, maxItems);
}

/**
 * 依次尝试 WM → RSS → mock，返回第一个非空结果。
 * 任意一层的错误都记录到 errors 里，但不阻塞后续尝试。
 *
 * @returns {Promise<{
 *   configured: boolean,
 *   items: IntelItemRaw[],
 *   source: 'worldmonitor' | 'rss' | 'mock' | 'none',
 *   fetchError: string | null,
 *   sourceErrors: string[]
 * }>}
 */
export async function fetchIntelFeed() {
  const maxItems = Math.min(
    100,
    Math.max(1, Number(process.env.INTEL_FEED_MAX_ITEMS || 80))
  );
  const errors = [];
  const configured = anyIntelSourceConfigured();

  if (resolveIntelExportUrl()) {
    const wm = await fetchWorldMonitorFeed();
    if (wm.configured && wm.items.length > 0) {
      console.log("[intel-feed] using worldmonitor", { count: wm.items.length });
      return {
        configured: true,
        items: capItems(maxItems, wm.items),
        source: "worldmonitor",
        fetchError: null,
        sourceErrors: errors,
      };
    }
    if (wm.fetchError) {
      errors.push(`worldmonitor: ${wm.fetchError}`);
    }
  }

  if (hasRssFallback()) {
    const rss = await fetchFallbackRssFeeds();
    if (rss.items.length > 0) {
      console.log("[intel-feed] using rss fallback", {
        count: rss.items.length,
        errors: rss.errors.length,
      });
      return {
        configured: true,
        items: capItems(maxItems, rss.items),
        source: "rss",
        fetchError: null,
        sourceErrors: [...errors, ...rss.errors],
      };
    }
    for (const e of rss.errors) errors.push(`rss: ${e}`);
  }

  if (isMockAllowed()) {
    const items = buildMockIntelItems();
    console.log("[intel-feed] using built-in mock", { count: items.length });
    return {
      configured: true,
      items: capItems(maxItems, items),
      source: "mock",
      fetchError: null,
      sourceErrors: errors,
    };
  }

  return {
    configured,
    items: [],
    source: "none",
    fetchError: errors.length > 0 ? errors.join(" | ") : null,
    sourceErrors: errors,
  };
}
