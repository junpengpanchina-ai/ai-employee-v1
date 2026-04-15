/**
 * @typedef {import("./normalize.js").NormalizedIntelRow} NormalizedIntelRow
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {NormalizedIntelRow[]} rows
 * @returns {Promise<number>} upsert 行数
 */
export async function upsertIntelItems(supabase, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    id: r.id,
    source: r.source,
    raw_ref_id: r.raw_ref_id,
    channel: r.channel,
    topic: r.topic,
    title: r.title,
    summary: r.summary,
    published_at: r.published_at,
    captured_at: r.captured_at,
    region: r.region,
    country_codes: r.country_codes,
    signals: r.signals,
    entities: r.entities,
    importance_score: r.importance_score,
    novelty_score: r.novelty_score,
    confidence_score: r.confidence_score,
    url: r.url,
    content_hash: r.content_hash,
    dedupe_key: r.dedupe_key,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase.from("intel_items").upsert(payload, {
    onConflict: "dedupe_key"
  });

  if (error) throw new Error(`intel_items upsert: ${error.message}`);
  return rows.length;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{
 *   sinceHours: number,
 *   limit: number,
 *   minImportance?: number,
 *   intelTopic?: string | null,
 *   intelChannel?: string
 * }} opts
 * @returns {Promise<NormalizedIntelRow[]>}
 */
export async function listIntelItemsSince(supabase, opts) {
  const {
    sinceHours,
    limit,
    minImportance = 0,
    intelTopic = null,
    intelChannel = "all"
  } = opts;
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const fetchLimit = Math.min(300, Math.max(limit * 5, limit));

  let q = supabase
    .from("intel_items")
    .select(
      "id, source, raw_ref_id, channel, topic, title, summary, published_at, captured_at, region, country_codes, signals, entities, importance_score, novelty_score, confidence_score, url, content_hash, dedupe_key"
    )
    .gte("captured_at", since);

  if (intelTopic) {
    q = q.eq("topic", intelTopic);
  } else if (intelChannel && intelChannel !== "all") {
    q = q.eq("channel", intelChannel);
  }

  const { data, error } = await q
    .order("captured_at", { ascending: false })
    .limit(fetchLimit);

  if (error) throw new Error(`intel_items select: ${error.message}`);
  let mapped = (data || []).map((row) => ({
    id: row.id,
    source: row.source,
    raw_ref_id: row.raw_ref_id,
    channel: row.channel,
    topic: row.topic,
    title: row.title,
    summary: row.summary,
    published_at: row.published_at,
    captured_at: row.captured_at,
    region: row.region,
    country_codes: Array.isArray(row.country_codes) ? row.country_codes : [],
    signals: Array.isArray(row.signals) ? row.signals : [],
    entities: Array.isArray(row.entities) ? row.entities : [],
    importance_score: row.importance_score,
    novelty_score: row.novelty_score,
    confidence_score: row.confidence_score,
    url: row.url,
    content_hash: row.content_hash,
    dedupe_key: row.dedupe_key
  }));

  if (minImportance > 0) {
    mapped = mapped.filter(
      (r) =>
        r.importance_score == null || r.importance_score >= minImportance
    );
  }

  return mapped.slice(0, limit);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<string | null>}
 */
export async function getLatestCapturedAt(supabase) {
  const { data, error } = await supabase
    .from("intel_items")
    .select("captured_at")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.captured_at ?? null;
}
