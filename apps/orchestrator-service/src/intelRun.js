import { callGRSAIWithSystem } from "./grsai.js";
import {
  INTEL_SYSTEM_PROMPT,
  buildIntelUserPrompt
} from "./intelPrompts.js";
import { formatIntelItemsForPrompt } from "./worldmonitorFeed.js";
import { fetchIntelFeed, anyIntelSourceConfigured } from "./intelFeed.js";
import { getSupabase } from "./ledger.js";
import {
  listIntelItemsSince,
  getLatestCapturedAt
} from "./adapters/worldmonitor/intelItemsRepo.js";
import { syncWorldMonitorIntel } from "./adapters/worldmonitor/sync.js";
import { INTEL_DEGRADED_REPLY } from "./intelDegraded.js";
import { persistIntelBriefOutcome } from "./adapters/worldmonitor/intelPersist.js";
import { parseIntelArgs } from "./intelArgs.js";

const NOT_CONFIGURED_REPLY = `情报源未配置。请在 orchestrator 环境变量中至少设置其一：
• WORLDMONITOR_INTEL_EXPORT_URL 或 WORLDMONITOR_PUBLIC_URL（自建 WM 实例）
• INTEL_FALLBACK_FEEDS=<rss1>,<rss2>（RSS/Atom/JSON Feed，逗号分隔）
• INTEL_ALLOW_MOCK=true（仅用于跑通链路）

详见仓库 docs/worldmonitor-plan.md、docs/worldmonitor-execution-checklist.md。`;

/**
 * @param {import("./adapters/worldmonitor/normalize.js").NormalizedIntelRow[]} rows
 * @returns {Record<string, unknown>[]}
 */
function normalizedRowsToFeedItems(rows) {
  return rows.map((r) => ({
    title: r.title,
    name: r.title,
    source: r.source,
    published_at: r.published_at,
    summary: r.summary,
    url: r.url,
    link: r.url
  }));
}

/**
 * @param {{
 *   sinceHours?: number,
 *   intelTopic?: string | null,
 *   intelChannel?: string
 * }} [overrides]
 */
export async function buildIntelBriefResult(overrides = {}) {
  const sinceHours =
    overrides.sinceHours != null
      ? overrides.sinceHours
      : Number(process.env.INTEL_SINCE_HOURS || 24);
  const intelTopic = overrides.intelTopic ?? null;
  const intelChannel = overrides.intelChannel ?? "all";

  const maxItems = Math.min(
    100,
    Math.max(1, Number(process.env.INTEL_FEED_MAX_ITEMS || 20))
  );
  const minImportance = Number(process.env.INTEL_MIN_IMPORTANCE || 0);
  const syncIfEmpty = process.env.INTEL_SYNC_ON_INTEL_IF_EMPTY !== "false";
  const fallbackLive =
    process.env.INTEL_FALLBACK_LIVE_FETCH !== "false";

  const listOpts = () => ({
    sinceHours,
    limit: maxItems,
    minImportance,
    intelTopic,
    intelChannel
  });

  const meta = {
    dataSource: "unknown",
    itemCount: 0,
    sinceHours,
    intelTopic,
    intelChannel,
    fetchError: null,
    degraded: false,
    lastCapturedAt: null
  };

  const supabase = getSupabase();

  if (!anyIntelSourceConfigured()) {
    return {
      replyText: NOT_CONFIGURED_REPLY,
      grsaiSkipped: true,
      meta: { ...meta, dataSource: "not_configured" }
    };
  }

  let rows = [];
  let dbReadError = null;

  if (supabase) {
    try {
      rows = await listIntelItemsSince(supabase, listOpts());
      meta.lastCapturedAt = await getLatestCapturedAt(supabase);
    } catch (e) {
      dbReadError = e;
      console.warn("[intel] listIntelItemsSince:", e);
    }
  }

  if (supabase && rows.length === 0 && syncIfEmpty && !dbReadError) {
    const sync = await syncWorldMonitorIntel(supabase);
    meta.fetchError = sync.fetchError;
    if (sync.ok && sync.stored >= 0) {
      try {
        rows = await listIntelItemsSince(supabase, listOpts());
        meta.lastCapturedAt = await getLatestCapturedAt(supabase);
      } catch (e) {
        console.warn("[intel] list after sync:", e);
      }
    }
    if (!sync.ok && sync.fetchError) {
      meta.fetchError = sync.fetchError;
    }
  }

  if (rows.length > 0) {
    meta.dataSource = "intel_items";
    meta.itemCount = rows.length;
    const block = formatIntelItemsForPrompt(
      normalizedRowsToFeedItems(rows)
    );
    const userPrompt = buildIntelUserPrompt(block);
    const replyText = await callGRSAIWithSystem({
      systemContent: INTEL_SYSTEM_PROMPT,
      userText: userPrompt
    });
    const out = { replyText, grsaiSkipped: false, meta };
    await persistIntelBriefOutcome(supabase, {
      replyText,
      grsaiSkipped: false,
      meta,
      sourceItemIds: rows.map((r) => r.id)
    });
    return out;
  }

  let live = {
    items: /** @type {Record<string, unknown>[]} */ ([]),
    fetchError: /** @type {string | null} */ (null),
    configured: true
  };

  if (fallbackLive || dbReadError || !supabase) {
    live = await fetchIntelFeed();
    meta.fetchError = live.fetchError;
    if (!live.configured) {
      return {
        replyText: NOT_CONFIGURED_REPLY,
        grsaiSkipped: true,
        meta: { ...meta, dataSource: "not_configured" }
      };
    }
    if (live.fetchError && live.items.length === 0) {
      meta.degraded = true;
      meta.dataSource = "degraded";
      const out = {
        replyText: INTEL_DEGRADED_REPLY,
        grsaiSkipped: true,
        meta
      };
      await persistIntelBriefOutcome(supabase, {
        replyText: INTEL_DEGRADED_REPLY,
        grsaiSkipped: true,
        meta,
        sourceItemIds: []
      });
      return out;
    }
    meta.dataSource = live.source
      ? `live_feed:${live.source}`
      : "live_feed";
    meta.itemCount = live.items.length;
    const block = formatIntelItemsForPrompt(live.items);
    const userPrompt = buildIntelUserPrompt(block);
    const replyText = await callGRSAIWithSystem({
      systemContent: INTEL_SYSTEM_PROMPT,
      userText: userPrompt
    });
    const out = { replyText, grsaiSkipped: false, meta };
    await persistIntelBriefOutcome(supabase, {
      replyText,
      grsaiSkipped: false,
      meta,
      sourceItemIds: []
    });
    return out;
  }

  if (meta.fetchError) {
    meta.degraded = true;
    meta.dataSource = "degraded";
    const out = {
      replyText: INTEL_DEGRADED_REPLY,
      grsaiSkipped: true,
      meta
    };
    await persistIntelBriefOutcome(supabase, {
      replyText: INTEL_DEGRADED_REPLY,
      grsaiSkipped: true,
      meta,
      sourceItemIds: []
    });
    return out;
  }

  meta.dataSource = "empty_window";
  meta.itemCount = 0;
  const block = formatIntelItemsForPrompt([]);
  const userPrompt = buildIntelUserPrompt(block);
  const replyText = await callGRSAIWithSystem({
    systemContent: INTEL_SYSTEM_PROMPT,
    userText: userPrompt
  });
  const out = { replyText, grsaiSkipped: false, meta };
  await persistIntelBriefOutcome(supabase, {
    replyText,
    grsaiSkipped: false,
    meta,
    sourceItemIds: []
  });
  return out;
}

/**
 * Telegram `/intel` 及变体：解析参数后读库 → 同步 → GRSAI；简报落 intel_briefs。
 * @param {{ text?: string }} [options] 完整消息文本，如 `/intel 48h`、`/intel macro`
 * @returns {Promise<{ replyText: string, grsaiSkipped: boolean }>}
 */
export async function runIntelBrief(options = {}) {
  const args = parseIntelArgs(options.text ?? "/intel");
  const out = await buildIntelBriefResult(args);
  return {
    replyText: out.replyText,
    grsaiSkipped: out.grsaiSkipped
  };
}
