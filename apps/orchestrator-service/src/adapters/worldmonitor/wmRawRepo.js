import { contentHashFromRaw } from "./normalize.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>[]} feedItems
 * @returns {Promise<string[]>} 与 feedItems 同序的 raw_id
 */
export async function upsertWmRawItems(supabase, feedItems) {
  if (!feedItems.length) return [];

  const rows = feedItems.map((x, index) => {
    const title = String(x.title || x.name || "Untitled").trim();
    const url = x.url || x.link ? String(x.url || x.link).trim() : null;
    const summary = String(x.summary || x.description || "").trim();
    const ch = contentHashFromRaw(x, index);
    const raw_id = `wm_raw_${ch.slice(0, 24)}`;
    let published_at = null;
    const pr = x.published_at || x.publishedAt;
    if (pr != null && String(pr).trim()) {
      const d = new Date(String(pr));
      if (!Number.isNaN(d.getTime())) published_at = d.toISOString();
    }
    return {
      raw_id,
      source: "worldmonitor",
      source_type: "json_feed",
      channel:
        typeof x.channel === "string" && x.channel.trim()
          ? x.channel.trim()
          : "all",
      source_url: url,
      title,
      fetched_at: new Date().toISOString(),
      published_at,
      content_hash: ch,
      payload_raw: x,
      fetch_status: "ok"
    };
  });

  const { error } = await supabase.from("wm_raw_items").upsert(rows, {
    onConflict: "raw_id"
  });

  if (error) throw new Error(`wm_raw_items upsert: ${error.message}`);
  return rows.map((r) => r.raw_id);
}
