import {
  insertIntelBrief,
  makeBriefId,
  extractActionsFromReply
} from "./intelBriefsRepo.js";
import { DEGRADED_BRIEF_FIELDS } from "../../intelDegraded.js";
import { extractIntelBriefSections } from "../../intelBriefSections.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {object} params
 * @param {string} params.replyText
 * @param {boolean} params.grsaiSkipped
 * @param {{ sinceHours: number, degraded?: boolean, intelTopic?: string | null, intelChannel?: string }} params.meta
 * @param {string[]} params.sourceItemIds
 * @param {string} [params.channel]
 * @param {string} [params.mode]
 */
export async function persistIntelBriefOutcome(supabase, params) {
  if (!supabase || process.env.INTEL_PERSIST_BRIEFS === "false") {
    return;
  }

  const {
    replyText,
    grsaiSkipped,
    meta,
    sourceItemIds,
    channel: channelParam,
    mode = "manual"
  } = params;

  const channelResolved =
    channelParam ??
    (meta.intelTopic != null && String(meta.intelTopic).trim() !== ""
      ? String(meta.intelTopic).trim()
      : meta.intelChannel ?? "all");

  const brief_id = makeBriefId(
    channelResolved,
    meta.sinceHours,
    sourceItemIds.length
  );

  const degraded = Boolean(meta.degraded);
  let top = "";
  let primary = "";
  let structural = "";
  let competitive = "";
  let relation = "";
  /** @type {string[]} */
  let actions = [];

  if (degraded) {
    top = DEGRADED_BRIEF_FIELDS.top_change;
    primary = DEGRADED_BRIEF_FIELDS.primary_contradiction;
    structural = DEGRADED_BRIEF_FIELDS.structural_flow;
    competitive = DEGRADED_BRIEF_FIELDS.competitive_position;
    relation = DEGRADED_BRIEF_FIELDS.relation_to_user;
    actions = DEGRADED_BRIEF_FIELDS.actions;
  } else if (!grsaiSkipped) {
    const sec = extractIntelBriefSections(replyText);
    top = sec.top_change;
    primary = sec.primary_contradiction;
    structural = sec.structural_flow;
    competitive = sec.competitive_position;
    relation = sec.relation_to_user;
    actions =
      sec.actions.length > 0 ? sec.actions : extractActionsFromReply(replyText);
  } else {
    actions = extractActionsFromReply(replyText);
  }

  await insertIntelBrief(supabase, {
    brief_id,
    mode,
    channel: channelResolved,
    since_hours: meta.sinceHours,
    source_item_ids: sourceItemIds,
    top_change: top,
    primary_contradiction: primary,
    structural_flow: structural,
    competitive_position: competitive,
    relation_to_user: relation,
    actions,
    reply_text: replyText,
    model_name: grsaiSkipped
      ? "fallback"
      : (process.env.BOT_MODEL || "").trim() || null,
    generated_at: new Date().toISOString()
  });
}
