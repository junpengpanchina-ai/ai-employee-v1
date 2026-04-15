import { fetchWorldMonitorFeed } from "../../worldmonitorFeed.js";
import { normalizeIntelItem } from "./normalize.js";
import { upsertIntelItems } from "./intelItemsRepo.js";
import { upsertWmRawItems } from "./wmRawRepo.js";

/**
 * 拉取 WM 导出 → 写 wm_raw_items → 标准化 → upsert intel_items。
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @returns {Promise<{
 *   ok: boolean,
 *   fetched: number,
 *   stored: number,
 *   stored_raw: number,
 *   configured: boolean,
 *   fetchError: string | null
 * }>}
 */
export async function syncWorldMonitorIntel(supabase) {
  const feed = await fetchWorldMonitorFeed();

  if (!feed.configured) {
    return {
      ok: true,
      fetched: 0,
      stored: 0,
      stored_raw: 0,
      configured: false,
      fetchError: feed.fetchError
    };
  }

  if (feed.fetchError) {
    return {
      ok: false,
      fetched: 0,
      stored: 0,
      stored_raw: 0,
      configured: true,
      fetchError: feed.fetchError
    };
  }

  if (!supabase) {
    return {
      ok: false,
      fetched: feed.items.length,
      stored: 0,
      stored_raw: 0,
      configured: true,
      fetchError: "supabase_not_configured"
    };
  }

  let stored_raw = 0;
  let stored = 0;
  try {
    /** @type {string[]} */
    let rawIds = [];
    try {
      rawIds = await upsertWmRawItems(supabase, feed.items);
      stored_raw = rawIds.length;
    } catch (e) {
      console.warn(
        "[intel] wm_raw_items upsert skipped:",
        e instanceof Error ? e.message : e
      );
      rawIds = feed.items.map(() => null);
    }
    const rows = feed.items.map((raw, i) =>
      normalizeIntelItem(raw, i, rawIds[i] || null)
    );
    stored = await upsertIntelItems(supabase, rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      fetched: feed.items.length,
      stored: 0,
      stored_raw: 0,
      configured: true,
      fetchError: msg
    };
  }

  return {
    ok: true,
    fetched: feed.items.length,
    stored,
    stored_raw,
    configured: true,
    fetchError: null
  };
}
