/**
 * WorldMonitor 供料：优先 JSON 导出 URL，否则用公网根拼 /api/export/intel。
 * 见 docs/worldmonitor-plan.md 取料契约。
 */

/** @typedef {{ title?: string, name?: string, source?: string, published_at?: string, summary?: string, url?: string, link?: string }} IntelItemRaw */

/**
 * 环境变量里常见手误：中文冒号、多余空格，会导致 URL 非法或 fetch 报「解析失败」。
 * @param {string} s
 * @returns {string}
 */
function sanitizeEnvUrlString(s) {
  return String(s ?? "")
    .replace(/\uFF1A/g, ":")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 无 `http(s)://` 时视为「仅主机或主机:端口」，自动补 `http://`（否则 `fetch` 不是合法绝对 URL）。
 * @param {string} s
 * @returns {string}
 */
export function ensureAbsoluteHttpUrl(s) {
  const t = sanitizeEnvUrlString(s);
  if (!t) return t;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  return `http://${t}`;
}

/**
 * Railway 私有网络 `*.railway.internal` 应对该主机使用 **http**，不要用 https（无公网证书时会导致 fetch 失败）。
 * 若 WM 监听非默认端口，请在 URL 里带上 `:PORT`（与 WM 容器内 `PORT` 一致）。
 * @param {string} url
 * @returns {string}
 */
export function normalizeWorldMonitorUrl(url) {
  const t = (url || "").trim();
  if (!t) return t;
  try {
    const u = new URL(t);
    if (u.hostname.endsWith(".railway.internal") && u.protocol === "https:") {
      u.protocol = "http:";
      return u.toString().replace(/\/$/, "");
    }
  } catch {
    // 非完整 URL 时原样返回（仅去尾斜杠）
  }
  return t.replace(/\/$/, "");
}

/**
 * 是否把 wm_… 密钥误填进 URL 变量（本地 curl 常见误用）。
 * @param {string | undefined} s
 * @returns {boolean}
 */
function looksLikeApiKeyInUrlField(s) {
  const t = (s || "").trim();
  if (!t || t.includes("://") || t.includes("/")) return false;
  return /^wm_[a-f0-9]{16,}$/i.test(t);
}

/** 已包含导出路径时不要重复拼接（常见误把完整 URL 填进 WORLDMONITOR_PUBLIC_URL） */
const EXPORT_INTEL_SUFFIX = "/api/export/intel";

/**
 * 折叠连续重复的导出后缀：
 *   https://x/api/export/intel/api/export/intel(/api/export/intel)*
 * → https://x/api/export/intel
 * @param {string} url
 * @returns {string}
 */
export function collapseRepeatedExportSuffix(url) {
  let out = String(url || "").replace(/\/+$/, "");
  while (true) {
    const lower = out.toLowerCase();
    const i = lower.indexOf(
      `${EXPORT_INTEL_SUFFIX}${EXPORT_INTEL_SUFFIX}`
    );
    if (i === -1) return out;
    out = out.slice(0, i + EXPORT_INTEL_SUFFIX.length) +
      out.slice(i + EXPORT_INTEL_SUFFIX.length * 2);
  }
}

/**
 * @param {string} baseUrl 已 ensureAbsolute 的根或完整导出 URL
 * @returns {string}
 */
export function joinIntelExportPath(baseUrl) {
  const b = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "");
  if (!b) return b;
  const lower = b.toLowerCase();
  if (lower.endsWith(EXPORT_INTEL_SUFFIX)) {
    return b;
  }
  return `${b}${EXPORT_INTEL_SUFFIX}`;
}

/**
 * 解析 orchestrator 环境变量，得到要请求的 URL；未配置则 null。
 * @returns {string | null}
 */
export function resolveIntelExportUrl() {
  const direct = (process.env.WORLDMONITOR_INTEL_EXPORT_URL || "").trim();
  const baseRaw = (process.env.WORLDMONITOR_PUBLIC_URL || "").trim();

  if (direct) {
    const absolute = ensureAbsoluteHttpUrl(direct);
    return normalizeWorldMonitorUrl(collapseRepeatedExportSuffix(absolute));
  }
  const base = baseRaw;
  if (!base) return null;
  const baseAbs = ensureAbsoluteHttpUrl(base);
  const joined = joinIntelExportPath(collapseRepeatedExportSuffix(baseAbs));
  const out = normalizeWorldMonitorUrl(joined);
  try {
    const u = new URL(out);
    if (u.hostname.endsWith(".railway.internal")) {
      console.warn(
        "[intel-feed] 使用 *.railway.internal：请确认 Railway 项目里存在同名 Service 且已 Online；否则 DNS 会失败。公网可改用 https://….up.railway.app 或官网 api.worldmonitor.app。"
      );
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * @param {IntelItemRaw} raw
 * @param {number} index
 * @returns {string}
 */
function formatOneItem(raw, index) {
  const title = raw.title || raw.name || `条目 ${index + 1}`;
  const lines = [`[${index + 1}]`, `标题：${title}`];
  if (raw.source) lines.push(`来源：${raw.source}`);
  if (raw.published_at) lines.push(`时间：${raw.published_at}`);
  const sum = raw.summary || raw.description;
  if (sum) lines.push(`摘要：${sum}`);
  const url = raw.url || raw.link;
  if (url) lines.push(`链接：${url}`);
  return lines.join("\n");
}

/**
 * @param {IntelItemRaw[]} items
 * @returns {string}
 */
export function formatIntelItemsForPrompt(items) {
  if (!items || items.length === 0) return "（暂无情报条目）";
  return items.map((it, i) => formatOneItem(it, i)).join("\n\n");
}

/**
 * @param {unknown} data
 * @returns {IntelItemRaw[]}
 */
function extractItemsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.intel)) return o.intel;
  }
  return [];
}

/**
 * 供料请求头：官方 SaaS 用 Bearer；自托管 Vercel WM 常用 X-WorldMonitor-Key（与 WORLDMONITOR_VALID_KEYS 中某一把一致）。
 * @returns {Record<string, string>}
 */
export function buildIntelFeedHeaders() {
  const h = /** @type {Record<string, string>} */ ({
    Accept: "application/json"
  });
  const bearer = (process.env.WORLDMONITOR_BEARER_TOKEN || "").trim();
  const gate = (process.env.WORLDMONITOR_GATE_KEY || "").trim();
  if (bearer) {
    h.Authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;
  }
  if (gate) {
    h["X-WorldMonitor-Key"] = gate;
  }
  h["User-Agent"] = (
    process.env.INTEL_FEED_USER_AGENT || "ai-employee-v1-orchestrator/1.0"
  ).trim();
  return h;
}

/**
 * @param {unknown} e
 * @returns {string}
 */
function formatNetworkFetchError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && e.cause != null) {
    const c =
      e.cause instanceof Error
        ? e.cause.message
        : String(e.cause);
    return `${msg} (cause: ${c})`;
  }
  return msg;
}

/**
 * @returns {Promise<{ configured: boolean, items: IntelItemRaw[], fetchError: string | null }>}
 */
export async function fetchWorldMonitorFeed() {
  const directEnv = (process.env.WORLDMONITOR_INTEL_EXPORT_URL || "").trim();
  const baseEnv = (process.env.WORLDMONITOR_PUBLIC_URL || "").trim();
  if (
    looksLikeApiKeyInUrlField(directEnv) ||
    looksLikeApiKeyInUrlField(baseEnv)
  ) {
    const msg =
      "环境变量误把 wm_… 密钥填进 URL：请把完整 https://… 地址填到 WORLDMONITOR_INTEL_EXPORT_URL 或 WORLDMONITOR_PUBLIC_URL，把密钥放到 WORLDMONITOR_GATE_KEY 或 WORLDMONITOR_BEARER_TOKEN";
    console.error("[intel-feed] 配置错误", { detail: msg });
    return { configured: true, items: [], fetchError: msg };
  }

  const url = resolveIntelExportUrl();
  if (!url) {
    return { configured: false, items: [], fetchError: null };
  }

  const timeoutMs = Number(process.env.INTEL_FEED_TIMEOUT_MS || 20000);
  const maxItems = Math.min(
    100,
    Math.max(1, Number(process.env.INTEL_FEED_MAX_ITEMS || 80))
  );

  const bodyPreviewLen = Math.min(
    800,
    Math.max(120, Number(process.env.INTEL_FEED_BODY_LOG_MAX || 400))
  );

  try {
    const ac = AbortSignal.timeout(timeoutMs);
    const hdr = buildIntelFeedHeaders();
    console.log("[intel-feed] GET", url, {
      hasAuthorization: Boolean(hdr.Authorization),
      hasXWorldMonitorKey: Boolean(hdr["X-WorldMonitor-Key"])
    });
    const res = await fetch(url, {
      method: "GET",
      headers: hdr,
      signal: ac
    });

    const rawText = await res.text();
    const preview = rawText.slice(0, bodyPreviewLen);

    if (!res.ok) {
      console.warn("[intel-feed] non-OK", {
        url,
        status: res.status,
        statusText: res.statusText,
        bodyPreview: preview || "(empty)"
      });
      return {
        configured: true,
        items: [],
        fetchError: `HTTP ${res.status}${preview ? `: ${preview.slice(0, 200)}` : ""}`
      };
    }

    let data;
    try {
      data = rawText.trim() ? JSON.parse(rawText) : null;
    } catch (parseErr) {
      console.warn("[intel-feed] JSON parse error", {
        url,
        bodyPreview: preview || "(empty)",
        message: parseErr instanceof Error ? parseErr.message : String(parseErr)
      });
      return {
        configured: true,
        items: [],
        fetchError: "响应不是合法 JSON"
      };
    }

    if (data == null) {
      console.warn("[intel-feed] empty body", { url });
      return {
        configured: true,
        items: [],
        fetchError: "响应体为空"
      };
    }

    let items = extractItemsArray(data);
    items = items.slice(0, maxItems);
    console.log("[intel-feed] ok", {
      url,
      status: res.status,
      itemCount: items.length
    });
    return { configured: true, items, fetchError: null };
  } catch (e) {
    const detail = formatNetworkFetchError(e);
    console.warn("[intel-feed] fetch failed (network/DNS/TLS/timeout)", {
      url,
      message: detail,
      name: e instanceof Error ? e.name : undefined
    });
    return { configured: true, items: [], fetchError: detail };
  }
}
