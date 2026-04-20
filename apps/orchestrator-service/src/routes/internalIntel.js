import { Router } from "express";
import { checkInternalSecret } from "../internalAuth.js";
import { getSupabase } from "../ledger.js";
import { buildIntelBriefResult } from "../intelRun.js";
import { syncWorldMonitorIntel } from "../adapters/worldmonitor/sync.js";
import { resolveIntelSlot, parseTopicBucket } from "../intelArgs.js";
import { notifyTelegramViaBotService } from "../intelNotify.js";

const router = Router();

const SLOT_PUSH_PREFIX = {
  morning: "【情报·早报】",
  noon: "【情报·午报】",
  night: "【情报·晚报】"
};

/**
 * 手动 / 定时：拉 WM 导出 → wm_raw_items / intel_items
 */
router.post("/internal/intel/sync", async (req, res) => {
  const auth = checkInternalSecret(req);
  if (!auth.ok) {
    return res.status(auth.status || 401).json(auth.body);
  }
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({
      ok: false,
      error: "supabase_not_configured",
      detail: "intel_items 需要 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY"
    });
  }
  try {
    const out = await syncWorldMonitorIntel(supabase);
    return res.json({
      ok: out.ok,
      configured: out.configured,
      fetched: out.fetched,
      stored: out.stored,
      stored_raw: out.stored_raw,
      fetch_error: out.fetchError
    });
  } catch (e) {
    console.error("[orchestrator-service] /internal/intel/sync:", e);
    return res.status(500).json({
      ok: false,
      error: "sync_failed",
      detail: e.message || String(e)
    });
  }
});

/**
 * 调试：与 Telegram /intel 同源；支持 since_hours、topic、channel
 */
router.get("/internal/intel/brief", async (req, res) => {
  const auth = checkInternalSecret(req);
  if (!auth.ok) {
    return res.status(auth.status || 401).json(auth.body);
  }
  const raw = req.query.since_hours;
  let sinceOverride;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0) {
      sinceOverride = Math.min(168, Math.max(1, Math.floor(n)));
    }
  }
  const topicRaw =
    (req.query.topic && String(req.query.topic).trim()) ||
    (req.query.intel_topic && String(req.query.intel_topic).trim()) ||
    null;
  const topicExplicitAll =
    topicRaw != null && /^all|\*$/i.test(String(topicRaw).trim());
  const topicBucket =
    topicRaw && !topicExplicitAll ? parseTopicBucket(topicRaw) : null;
  const channelQ =
    (req.query.channel && String(req.query.channel).trim()) || "all";
  const slotResolved =
    req.query.slot != null && String(req.query.slot).trim() !== ""
      ? resolveIntelSlot(req.query.slot)
      : null;

  try {
    const out = await buildIntelBriefResult({
      ...(sinceOverride != null ? { sinceHours: sinceOverride } : {}),
      ...(topicBucket != null && topicBucket.length
        ? { intelTopics: topicBucket }
        : {}),
      ...(topicExplicitAll ? { applySlotTopicDefault: false } : {}),
      ...(slotResolved ? { intelSlot: slotResolved } : {}),
      intelChannel: channelQ
    });
    return res.json({
      ok: true,
      reply_text: out.replyText,
      grsai_skipped: out.grsaiSkipped,
      meta: out.meta
    });
  } catch (e) {
    console.error("[orchestrator-service] /internal/intel/brief:", e);
    return res.status(500).json({
      ok: false,
      error: "brief_failed",
      detail: e.message || String(e)
    });
  }
});

/**
 * 定时任务：生成指定时段简报 → 经 bot-service 发到老板 Telegram。
 * Query / JSON body：`slot=morning|noon|night`；可选 `chat_id`（缺省用 TELEGRAM_BOSS_CHAT_ID）；
 * `sync_first=true` 时先执行一次 intel sync。
 */
router.post("/internal/intel/push", async (req, res) => {
  const auth = checkInternalSecret(req);
  if (!auth.ok) {
    return res.status(auth.status || 401).json(auth.body);
  }

  const slotRaw = req.query.slot ?? req.body?.slot;
  const slot = resolveIntelSlot(slotRaw);
  if (!slot) {
    return res.status(400).json({
      ok: false,
      error: "invalid_slot",
      detail: "expected slot=morning|noon|night"
    });
  }

  const qChat =
    req.query.chat_id != null ? String(req.query.chat_id).trim() : "";
  const bodyChat =
    req.body?.chat_id != null ? String(req.body.chat_id).trim() : "";
  const chatId =
    qChat ||
    bodyChat ||
    String(process.env.TELEGRAM_BOSS_CHAT_ID || "").trim();

  if (!chatId) {
    return res.status(400).json({
      ok: false,
      error: "missing_chat_id",
      detail:
        "set TELEGRAM_BOSS_CHAT_ID or pass chat_id in query/body (Telegram 数字 id)"
    });
  }

  const supabase = getSupabase();
  const wantSync =
    String(req.query.sync_first || "").toLowerCase() === "true" ||
    req.body?.sync_first === true;

  if (wantSync) {
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error: "supabase_not_configured",
        detail: "sync_first requires Supabase for intel sync"
      });
    }
    try {
      await syncWorldMonitorIntel(supabase);
    } catch (e) {
      console.error("[orchestrator-service] /internal/intel/push sync_first:", e);
      return res.status(500).json({
        ok: false,
        error: "sync_failed",
        detail: e.message || String(e)
      });
    }
  }

  const sinceRaw =
    req.query.since_hours ?? req.body?.since_hours ?? req.body?.sinceHours;
  let sinceOverride;
  if (sinceRaw != null && String(sinceRaw).trim() !== "") {
    const n = Number(sinceRaw);
    if (!Number.isNaN(n) && n > 0) {
      sinceOverride = Math.min(168, Math.max(1, Math.floor(n)));
    }
  }

  try {
    const out = await buildIntelBriefResult({
      intelSlot: slot,
      persistMode: `scheduled_${slot}`,
      ...(sinceOverride != null ? { sinceHours: sinceOverride } : {})
    });
    const prefix = SLOT_PUSH_PREFIX[slot] || "【情报】";
    const body = `${prefix}\n\n${out.replyText}`;
    const telegram = await notifyTelegramViaBotService(
      chatId,
      body,
      out.sourceLinkButtons
    );
    const delivered =
      telegram.ok === true && !telegram.skipped;
    const httpStatus = delivered ? 200 : telegram.skipped ? 503 : 502;
    return res.status(httpStatus).json({
      ok: delivered,
      reply_text: out.replyText,
      grsai_skipped: out.grsaiSkipped,
      meta: out.meta,
      ...(out.sourceLinkButtons?.length
        ? { source_link_buttons: out.sourceLinkButtons }
        : {}),
      telegram
    });
  } catch (e) {
    console.error("[orchestrator-service] /internal/intel/push:", e);
    return res.status(500).json({
      ok: false,
      error: "push_failed",
      detail: e.message || String(e)
    });
  }
});

export default router;
