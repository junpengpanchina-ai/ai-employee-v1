import { createHash } from "node:crypto";
import {
  inferSignals,
  inferTopic,
  scoreImportance
} from "./intelScoring.js";

/**
 * @typedef {Object} NormalizedIntelRow
 * @property {string} id
 * @property {string} source
 * @property {string | null} channel
 * @property {string | null} topic
 * @property {string} title
 * @property {string | null} summary
 * @property {string | null} published_at ISO 8601 or null
 * @property {string} captured_at ISO 8601
 * @property {string | null} region
 * @property {unknown[]} country_codes
 * @property {string[]} signals
 * @property {string[]} entities
 * @property {number | null} importance_score
 * @property {number | null} novelty_score
 * @property {number | null} confidence_score
 * @property {string | null} url
 * @property {string} content_hash
 * @property {string} dedupe_key
 * @property {string | null} raw_ref_id
 */

/**
 * @param {unknown} v
 * @returns {string[]}
 */
function asStringArray(v) {
  if (Array.isArray(v)) {
    return v.map((x) => String(x)).filter(Boolean);
  }
  return [];
}

/**
 * @param {Record<string, unknown>} raw
 * @param {number} index
 * @returns {string}
 */
export function contentHashFromRaw(raw, index) {
  const title = String(raw.title || raw.name || "").trim() || `item_${index}`;
  const url = String(raw.url || raw.link || "").trim();
  const published = String(raw.published_at || raw.publishedAt || "").trim();
  const source = String(raw.source || "worldmonitor").trim();
  const summary = String(raw.summary || raw.description || "").trim();
  const h = createHash("sha256");
  h.update(`${source}\n${title}\n${url}\n${published}\n${summary}`);
  return h.digest("hex");
}

/**
 * 标题 + 链接去重（与 content_hash 全量指纹区分）。
 * @param {Record<string, unknown>} raw
 * @param {number} index
 * @returns {string}
 */
export function dedupeKeyFromRaw(raw, index) {
  const title = String(raw.title || raw.name || "").trim() || `item_${index}`;
  const url = String(raw.url || raw.link || "").trim();
  return createHash("sha256")
    .update(`${title}\n${url}`)
    .digest("hex");
}

/**
 * @param {Record<string, unknown>} raw
 * @param {number} index
 * @param {string | null} [rawRefId] wm_raw_items.raw_id
 * @returns {NormalizedIntelRow}
 */
export function normalizeIntelItem(raw, index, rawRefId = null) {
  const content_hash = contentHashFromRaw(raw, index);
  const dedupe_key = dedupeKeyFromRaw(raw, index);
  const id = `intel_wm_${dedupe_key.slice(0, 32)}`;

  const title =
    String(raw.title || raw.name || "").trim() || `未命名条目 ${index + 1}`;
  const url = (raw.url || raw.link || null)
    ? String(raw.url || raw.link).trim()
    : null;
  const summary = raw.summary || raw.description || null;
  const publishedRaw = raw.published_at || raw.publishedAt;
  let published_at = null;
  if (publishedRaw != null && String(publishedRaw).trim()) {
    const d = new Date(String(publishedRaw));
    if (!Number.isNaN(d.getTime())) {
      published_at = d.toISOString();
    }
  }
  const captured_at = new Date().toISOString();
  const channel =
    typeof raw.channel === "string" && raw.channel.trim()
      ? raw.channel.trim()
      : "all";
  let topic =
    typeof raw.topic === "string" && raw.topic.trim()
      ? raw.topic.trim()
      : null;
  const region =
    typeof raw.region === "string" && raw.region.trim()
      ? raw.region.trim()
      : "global";

  const titleForInfer = title;
  const summaryForInfer =
    summary != null ? String(summary).trim() : "";
  if (!topic) {
    topic = inferTopic({ title: titleForInfer, summary: summaryForInfer });
  }

  let signals = asStringArray(raw.signals);
  if (signals.length === 0) {
    signals = inferSignals({ title: titleForInfer, summary: summaryForInfer });
  }

  let importance_score =
    typeof raw.importance_score === "number"
      ? raw.importance_score
      : null;
  if (importance_score == null) {
    importance_score = scoreImportance({
      title: titleForInfer,
      summary: summaryForInfer
    });
  }

  const novelty_score =
    typeof raw.novelty_score === "number" ? raw.novelty_score : 70;
  const confidence_score =
    typeof raw.confidence_score === "number"
      ? raw.confidence_score
      : 85;

  return {
    id,
    source: String(raw.source || "worldmonitor").trim() || "worldmonitor",
    channel,
    topic,
    title,
    summary: summary != null ? String(summary).trim() || null : null,
    published_at,
    captured_at,
    region,
    country_codes: asStringArray(raw.country_codes),
    signals,
    entities: asStringArray(raw.entities),
    importance_score,
    novelty_score,
    confidence_score,
    url,
    content_hash,
    dedupe_key,
    raw_ref_id: rawRefId
  };
}
