/**
 * 轻量 RSS / Atom / JSON Feed 解析（不新增依赖）。
 * 只覆盖主流字段，够 /intel 端到端跑通；复杂 Feed 请换成 WM 自建源。
 */

/** @typedef {import("../worldmonitorFeed.js").IntelItemRaw} IntelItemRaw */

/**
 * @param {string} s
 * @returns {string}
 */
function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * @param {string} s
 * @returns {string}
 */
function stripTags(s) {
  return decodeEntities(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} xml
 * @param {string} tag
 * @returns {string | null}
 */
function pickTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
}

/**
 * @param {string} itemXml
 * @returns {string | null}
 */
function pickAtomLink(itemXml) {
  const href = itemXml.match(/<link[^>]*\shref="([^"]+)"/i);
  if (href) return href[1];
  return pickTag(itemXml, "link");
}

/**
 * @param {string} xml
 * @returns {IntelItemRaw[]}
 */
function parseRssXml(xml) {
  const items = [];
  const itemRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let match;
  while ((match = itemRe.exec(xml)) != null) {
    const block = match[0];
    const title = pickTag(block, "title") || "";
    const link = pickAtomLink(block) || "";
    const summary =
      pickTag(block, "description") ||
      pickTag(block, "summary") ||
      pickTag(block, "content") ||
      "";
    const pubDate =
      pickTag(block, "pubDate") ||
      pickTag(block, "updated") ||
      pickTag(block, "published") ||
      pickTag(block, "dc:date") ||
      "";
    let publishedIso = pubDate;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!Number.isNaN(d.getTime())) publishedIso = d.toISOString();
    }
    items.push({
      title: stripTags(title),
      source: "",
      published_at: publishedIso || undefined,
      summary: stripTags(summary).slice(0, 800),
      url: String(link || "").trim() || undefined,
    });
  }
  return items;
}

/**
 * @param {unknown} data
 * @returns {IntelItemRaw[]}
 */
function parseJsonFeed(data) {
  if (!data || typeof data !== "object") return [];
  const obj = /** @type {Record<string, unknown>} */ (data);
  const arr = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.entries)
    ? obj.entries
    : Array.isArray(obj.data)
    ? obj.data
    : [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const it = /** @type {Record<string, unknown>} */ (x);
      const title = String(it.title || it.name || "").trim();
      const summary = String(
        it.summary || it.description || it.content_text || it.content_html || ""
      );
      const url = String(it.url || it.link || it.external_url || "").trim();
      const published = String(
        it.date_published || it.published || it.pubDate || it.updated || ""
      );
      let publishedIso = published;
      if (published) {
        const d = new Date(published);
        if (!Number.isNaN(d.getTime())) publishedIso = d.toISOString();
      }
      return {
        title,
        source: "",
        published_at: publishedIso || undefined,
        summary: stripTags(summary).slice(0, 800),
        url: url || undefined,
      };
    });
}

/**
 * @param {string} url
 * @param {{ timeoutMs: number, userAgent: string }} opts
 * @returns {Promise<IntelItemRaw[]>}
 */
async function fetchOneFeed(url, opts) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      "User-Agent": opts.userAgent,
    },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const body = await res.text();
  let items = [];
  if (ct.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
    try {
      items = parseJsonFeed(JSON.parse(body));
    } catch {
      items = [];
    }
  }
  if (items.length === 0) {
    items = parseRssXml(body);
  }
  try {
    const host = new URL(url).hostname;
    for (const it of items) if (!it.source) it.source = host;
  } catch {
    /* ignore */
  }
  return items;
}

/**
 * 读取 INTEL_FALLBACK_FEEDS 里的所有 URL，合并结果；单条失败不影响其它源。
 * @returns {Promise<{ configured: boolean, items: IntelItemRaw[], errors: string[] }>}
 */
export async function fetchFallbackRssFeeds() {
  const raw = (process.env.INTEL_FALLBACK_FEEDS || "").trim();
  if (!raw) {
    return { configured: false, items: [], errors: [] };
  }
  const urls = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
  if (urls.length === 0) {
    return { configured: false, items: [], errors: [] };
  }
  const timeoutMs = Number(process.env.INTEL_FEED_TIMEOUT_MS || 20000);
  const userAgent = (
    process.env.INTEL_FEED_USER_AGENT || "ai-employee-v1-orchestrator/1.0"
  ).trim();
  const errors = [];
  /** @type {IntelItemRaw[]} */
  const all = [];
  const results = await Promise.allSettled(
    urls.map((u) => fetchOneFeed(u, { timeoutMs, userAgent }))
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      all.push(...r.value);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push(`${urls[i]}: ${msg}`);
      console.warn("[intel-feed] fallback rss failed", { url: urls[i], message: msg });
    }
  });
  return { configured: true, items: all, errors };
}
