import { createHash } from "node:crypto";

/**
 * @param {string} channel
 * @param {number} sinceHours
 * @param {number} itemCount
 * @returns {string}
 */
export function makeBriefId(channel, sinceHours, itemCount) {
  const raw = `${channel}|${sinceHours}|${itemCount}|${Date.now()}`;
  return `brief_${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

/**
 * @param {string} replyText
 * @returns {string[]}
 */
export function extractActionsFromReply(replyText) {
  const lines = String(replyText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.filter((x) => /^\d+\./.test(x)).slice(0, 8);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} row
 * @returns {Promise<void>}
 */
export async function insertIntelBrief(supabase, row) {
  const { error } = await supabase.from("intel_briefs").insert(row);
  if (error) {
    console.warn("[intel_briefs] insert failed:", error.message);
  }
}
