import { buildIntelBriefResult } from "./intelRun.js";
import { notifyTelegramViaBotService } from "./intelNotify.js";
import { syncWorldMonitorIntel } from "./adapters/worldmonitor/sync.js";
import { getSupabase } from "./ledger.js";

export const SLOT_PUSH_PREFIX = {
  morning: "【情报·早报】",
  noon: "【情报·午报】",
  night: "【情报·晚报】"
};

/**
 * 定时 / 手动 HTTP 共用：生成简报 → Telegram（不经 HTTP 鉴权层）。
 * @param {{
 *   slot: "morning" | "noon" | "night",
 *   chatId?: string | null,
 *   syncFirst?: boolean,
 *   sinceHours?: number
 * }} params
 * @returns {Promise<{
 *   ok: boolean,
 *   delivered: boolean,
 *   error?: string,
 *   reply_text: string,
 *   grsai_skipped: boolean,
 *   meta: Record<string, unknown>,
 *   telegram: Record<string, unknown>,
 *   source_link_buttons?: { text: string, url: string }[]
 * }>}
 */
export async function runIntelScheduledPush(params) {
  const { slot, syncFirst = false, sinceHours } = params;
  const chatId =
    (params.chatId != null && String(params.chatId).trim()) ||
    String(process.env.TELEGRAM_BOSS_CHAT_ID || "").trim();

  if (!chatId) {
    return {
      ok: false,
      delivered: false,
      error: "missing_chat_id",
      reply_text: "",
      grsai_skipped: true,
      meta: {},
      telegram: { skipped: true, reason: "missing TELEGRAM_BOSS_CHAT_ID" }
    };
  }

  const supabase = getSupabase();
  if (syncFirst) {
    if (!supabase) {
      return {
        ok: false,
        delivered: false,
        error: "supabase_not_configured",
        reply_text: "",
        grsai_skipped: true,
        meta: {},
        telegram: { skipped: true, reason: "sync_first needs Supabase" }
      };
    }
    try {
      await syncWorldMonitorIntel(supabase);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[intel-scheduled-push] sync_first failed:", msg);
      return {
        ok: false,
        delivered: false,
        error: "sync_failed",
        reply_text: "",
        grsai_skipped: true,
        meta: {},
        telegram: { skipped: true, detail: msg }
      };
    }
  }

  const out = await buildIntelBriefResult({
    intelSlot: slot,
    persistMode: `scheduled_${slot}`,
    ...(sinceHours != null ? { sinceHours } : {})
  });
  const prefix = SLOT_PUSH_PREFIX[slot] || "【情报】";
  const body = `${prefix}\n\n${out.replyText}`;
  const telegram = await notifyTelegramViaBotService(
    chatId,
    body,
    out.sourceLinkButtons
  );
  const delivered = telegram.ok === true && !telegram.skipped;

  return {
    ok: delivered,
    delivered,
    reply_text: out.replyText,
    grsai_skipped: out.grsaiSkipped,
    meta: out.meta,
    telegram,
    ...(out.sourceLinkButtons?.length
      ? { source_link_buttons: out.sourceLinkButtons }
      : {})
  };
}
