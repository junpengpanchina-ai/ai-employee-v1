/**
 * Telegram `/intel` 与调试接口参数解析。
 * 支持：`/intel`、`/intel 72h`、`/intel macro`（按 topic 过滤）、
 * `/intel morning|noon|night`（分时段口径与默认时间窗）等。
 */

const DEFAULT_HOURS = () =>
  Number(process.env.INTEL_SINCE_HOURS || 24);

/** 早报 / 午报 / 晚报 → 默认读库窗口（小时），可被消息里的显式 `12h` / `12` 覆盖 */
function slotDefaultSinceHours(slot) {
  const envKey =
    slot === "morning"
      ? "INTEL_SLOT_MORNING_SINCE_HOURS"
      : slot === "noon"
        ? "INTEL_SLOT_NOON_SINCE_HOURS"
        : "INTEL_SLOT_NIGHT_SINCE_HOURS";
  const def = slot === "morning" ? 16 : slot === "noon" ? 6 : 14;
  const n = Number(process.env[envKey] || def);
  return Math.min(168, Math.max(1, Number.isFinite(n) ? Math.floor(n) : def));
}

/**
 * 编程入口（定时推送、HTTP）在未显式传 sinceHours 时用：无 slot → INTEL_SINCE_HOURS；有 slot → 各时段默认窗。
 * @param {'morning' | 'noon' | 'night' | null | undefined} intelSlot
 */
export function defaultSinceHoursForIntelSlot(intelSlot) {
  if (!intelSlot) return DEFAULT_HOURS();
  return slotDefaultSinceHours(intelSlot);
}

/** 用户词 → morning | noon | night */
export const SLOT_ALIASES = {
  morning: "morning",
  早报: "morning",
  noon: "noon",
  午报: "noon",
  午间: "noon",
  night: "night",
  晚报: "night",
  夜间: "night",
  复盘: "night"
};

/** 用户口语 → intel_items.topic */
export const TOPIC_ALIASES = {
  macro: "macro",
  market: "macro",
  宏观: "macro",
  geopolitics: "geopolitics",
  geo: "geopolitics",
  地缘: "geopolitics",
  startup: "startup",
  创业: "startup",
  tech: "tech",
  科技: "tech",
  general: "general",
  world: "macro",
  ai: "tech",
  business: "general",
  business_opportunity: "general",
  market_signal: "macro",
  money: "macro"
};

const SLOT_ENV_SUFFIX = {
  morning: "MORNING",
  noon: "NOON",
  night: "NIGHT"
};

/**
 * HTTP `?slot=` 与别名词 → morning | noon | night
 * @param {unknown} raw
 * @returns {'morning' | 'noon' | 'night' | null}
 */
export function resolveIntelSlot(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const key = String(raw).trim().toLowerCase().split(/\s+/)[0];
  if (key === "morning" || key === "noon" || key === "night") return key;
  return SLOT_ALIASES[key] ?? null;
}

/**
 * @param {unknown} text 完整消息，如 "/intel macro" 或 "/intel 48h"
 * @returns {{
 *   sinceHours: number,
 *   intelTopic: string | null,
 *   intelChannel: string,
 *   intelSlot: 'morning' | 'noon' | 'night' | null
 * }}
 */
export function parseIntelArgs(text) {
  const t = String(text ?? "").trim();
  const rest = t.replace(/^\/intel\b/i, "").trim();

  if (!rest) {
    return {
      sinceHours: DEFAULT_HOURS(),
      intelTopic: null,
      intelChannel: "all",
      intelSlot: null
    };
  }

  const tokens = rest.split(/\s+/).filter(Boolean);

  /** @type {'morning' | 'noon' | 'night' | null} */
  let intelSlot = null;
  /** @type {string | null} */
  let intelTopic = null;
  /** @type {number | null} */
  let explicitHours = null;

  for (const raw of tokens) {
    const low = raw.toLowerCase();
    if (SLOT_ALIASES[low] != null || SLOT_ALIASES[raw] != null) {
      intelSlot = /** @type {'morning' | 'noon' | 'night'} */ (
        SLOT_ALIASES[low] ?? SLOT_ALIASES[raw]
      );
      continue;
    }
    const topicHit = TOPIC_ALIASES[low];
    if (topicHit) {
      intelTopic = topicHit;
      continue;
    }
    const hm = /^(\d+)\s*h$/i.exec(raw);
    if (hm) {
      explicitHours = Math.min(168, Math.max(1, parseInt(hm[1], 10)));
      continue;
    }
    if (/^\d+$/.test(raw)) {
      explicitHours = Math.min(168, Math.max(1, parseInt(raw, 10)));
    }
  }

  if (tokens.length === 1) {
    const only = tokens[0];
    const low = only.toLowerCase();
    const hOnly = /^(\d+)\s*h$/i.exec(only);
    if (hOnly) {
      const h = Math.min(168, Math.max(1, parseInt(hOnly[1], 10)));
      return {
        sinceHours: h,
        intelTopic: null,
        intelChannel: "all",
        intelSlot: null
      };
    }
    if (/^\d+$/.test(only)) {
      const h = Math.min(168, Math.max(1, parseInt(only, 10)));
      return {
        sinceHours: h,
        intelTopic: null,
        intelChannel: "all",
        intelSlot: null
      };
    }
    const topicOnly = TOPIC_ALIASES[low];
    if (topicOnly) {
      return {
        sinceHours: DEFAULT_HOURS(),
        intelTopic: topicOnly,
        intelChannel: "all",
        intelSlot: null
      };
    }
    if (SLOT_ALIASES[low] != null || SLOT_ALIASES[only] != null) {
      const s = SLOT_ALIASES[low] ?? SLOT_ALIASES[only];
      return {
        sinceHours: slotDefaultSinceHours(s),
        intelTopic: null,
        intelChannel: "all",
        intelSlot: s
      };
    }
    return {
      sinceHours: DEFAULT_HOURS(),
      intelTopic: null,
      intelChannel: only || "all",
      intelSlot: null
    };
  }

  const sinceHours =
    explicitHours != null
      ? explicitHours
      : intelSlot
        ? slotDefaultSinceHours(intelSlot)
        : DEFAULT_HOURS();

  const nonSlotTopicHour = tokens.filter((raw) => {
    const low = raw.toLowerCase();
    if (SLOT_ALIASES[low] || SLOT_ALIASES[raw]) return false;
    if (TOPIC_ALIASES[low]) return false;
    if (/^(\d+)\s*h$/i.test(raw) || /^\d+$/.test(raw)) return false;
    return true;
  });
  const intelChannel =
    !intelTopic && !intelSlot && nonSlotTopicHour.length > 0
      ? nonSlotTopicHour[0]
      : "all";

  return {
    sinceHours,
    intelTopic,
    intelChannel,
    intelSlot
  };
}

/**
 * 逗号 / 中文逗号分隔的 topic 列表 → 去重后的 `intel_items.topic` 值数组；整串为 `all/*` 则 null。
 * @param {unknown} raw
 * @returns {string[] | null}
 */
export function parseTopicBucket(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (/^all|\*$/i.test(s)) return null;
  const parts = s.split(/[,，]\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const p of parts) {
    const r = resolveTopicFilter(p);
    if (!r) continue;
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out.length ? out : null;
}

/**
 * @param {unknown[]} topics
 * @returns {string[]}
 */
export function normalizeIntelTopicsArray(topics) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const t of topics || []) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * 显式 topic（可逗号 bucket）优先；否则在有 slot 时读 `INTEL_SLOT_<SLOT>_TOPIC`（同样支持逗号），
 * 未设置该环境变量时：早报 `macro`；午报 `startup,tech,general`；晚报不过滤（P2.6）。
 * @param {'morning' | 'noon' | 'night' | null | undefined} intelSlot
 * @param {string | null | undefined} explicitTopic
 * @param {{ skipSlotTopicDefault?: boolean }} [options] `topic=all` 等场景下为 true，禁止按 slot 注入 topic
 * @returns {string[] | null}
 */
export function resolveIntelTopicBucketForSlotBrief(
  intelSlot,
  explicitTopic,
  options = {}
) {
  const skip = options.skipSlotTopicDefault === true;
  const ex =
    explicitTopic != null && String(explicitTopic).trim() !== ""
      ? String(explicitTopic).trim()
      : null;
  if (ex) {
    return parseTopicBucket(ex);
  }
  if (skip) return null;
  if (!intelSlot) return null;
  const suf = SLOT_ENV_SUFFIX[/** @type {'morning'|'noon'|'night'} */ (intelSlot)];
  if (!suf) return null;
  const envKey = `INTEL_SLOT_${suf}_TOPIC`;
  if (Object.prototype.hasOwnProperty.call(process.env, envKey)) {
    const raw = String(process.env[envKey] ?? "").trim();
    if (!raw || /^all|\*$/i.test(raw)) return null;
    return parseTopicBucket(raw);
  }
  if (intelSlot === "morning") return ["macro"];
  if (intelSlot === "noon") return ["startup", "tech", "general"];
  return null;
}

/**
 * 自定义 channel 优先；`all` 时在有 slot 时可被 `INTEL_SLOT_<SLOT>_CHANNEL` 覆盖。
 * @param {'morning' | 'noon' | 'night' | null | undefined} intelSlot
 * @param {string | null | undefined} explicitChannel
 * @returns {string}
 */
export function resolveIntelChannelForSlotBrief(intelSlot, explicitChannel) {
  const ex =
    explicitChannel != null && String(explicitChannel).trim() !== ""
      ? String(explicitChannel).trim()
      : "all";
  if (ex !== "all") return ex;
  if (!intelSlot) return "all";
  const suf = SLOT_ENV_SUFFIX[/** @type {'morning'|'noon'|'night'} */ (intelSlot)];
  if (!suf) return "all";
  const envKey = `INTEL_SLOT_${suf}_CHANNEL`;
  if (Object.prototype.hasOwnProperty.call(process.env, envKey)) {
    const raw = String(process.env[envKey] ?? "").trim();
    if (!raw || /^all|\*$/i.test(raw)) return "all";
    return raw;
  }
  return "all";
}

/**
 * HTTP `?topic=` 与别名词 → intel_items.topic 列取值
 * @param {unknown} raw
 * @returns {string | null}
 */
export function resolveTopicFilter(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const key = String(raw).trim().toLowerCase().split(/\s+/)[0];
  if (key === "all" || key === "*") return null;
  return TOPIC_ALIASES[key] ?? key;
}
