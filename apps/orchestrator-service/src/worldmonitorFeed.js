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
 * 解析 orchestrator 环境变量，得到要请求的 URL；未配置则 null。
 * @returns {string | null}
 */
export function resolveIntelExportUrl() {
  const direct = (process.env.WORLDMONITOR_INTEL_EXPORT_URL || "").trim();
  if (direct) {
    return normalizeWorldMonitorUrl(ensureAbsoluteHttpUrl(direct));
  }
  const base = (process.env.WORLDMONITOR_PUBLIC_URL || "").trim();
  if (!base) return null;
  const baseAbs = ensureAbsoluteHttpUrl(base);
  const joined = `${baseAbs.replace(/\/$/, "")}/api/export/intel`;
  return normalizeWorldMonitorUrl(joined);
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
  return h;
}

/**
 * @returns {Promise<{ configured: boolean, items: IntelItemRaw[], fetchError: string | null }>}
 */
export async function fetchWorldMonitorFeed() {
  const url = resolveIntelExportUrl();
  if (!url) {
    return { configured: false, items: [], fetchError: null };
  }

  const timeoutMs = Number(process.env.INTEL_FEED_TIMEOUT_MS || 20000);
  const maxItems = Math.min(
    100,
    Math.max(1, Number(process.env.INTEL_FEED_MAX_ITEMS || 20))
  );

  const bodyPreviewLen = Math.min(
    800,
    Math.max(120, Number(process.env.INTEL_FEED_BODY_LOG_MAX || 400))
  );

  try {
    const ac = AbortSignal.timeout(timeoutMs);
    console.log("[intel-feed] GET", url);
    const res = await fetch(url, {
      method: "GET",
      headers: buildIntelFeedHeaders(),
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
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[intel-feed] fetch failed (network/DNS/TLS/timeout)", {
      url,
      message: msg
    });
    return { configured: true, items: [], fetchError: msg };
  }
}
