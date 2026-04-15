import { Router } from "express";
import { checkInternalSecret } from "../internalAuth.js";
import { getSupabase } from "../ledger.js";
import { buildIntelBriefResult } from "../intelRun.js";
import { syncWorldMonitorIntel } from "../adapters/worldmonitor/sync.js";
import { resolveTopicFilter } from "../intelArgs.js";

const router = Router();

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
  const topicResolved = topicRaw ? resolveTopicFilter(topicRaw) : null;
  const channelQ =
    (req.query.channel && String(req.query.channel).trim()) || "all";

  try {
    const out = await buildIntelBriefResult({
      ...(sinceOverride != null ? { sinceHours: sinceOverride } : {}),
      ...(topicResolved ? { intelTopic: topicResolved } : {}),
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

export default router;
