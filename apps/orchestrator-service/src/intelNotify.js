/**
 * 定时推送：orchestrator 生成正文后，经 bot-service 调 Telegram（不在此服务持有 TELEGRAM_BOT_TOKEN）。
 */

/**
 * @param {string | number} chatId
 * @param {string} text
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, detail?: string }>}
 */
export async function notifyTelegramViaBotService(chatId, text) {
  const base = String(process.env.BOT_SERVICE_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(
    process.env.BOT_INTERNAL_SECRET ||
      process.env.ORCHESTRATOR_INTERNAL_SECRET ||
      ""
  ).trim();

  if (!base) {
    return {
      ok: false,
      skipped: true,
      reason: "BOT_SERVICE_BASE_URL not set"
    };
  }
  if (!secret) {
    return {
      ok: false,
      skipped: true,
      reason: "BOT_INTERNAL_SECRET or ORCHESTRATOR_INTERNAL_SECRET not set"
    };
  }

  const url = `${base}/internal/notify`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": secret
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 4096)
      })
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[intel-notify] fetch failed:", msg);
    return { ok: false, detail: msg };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const detail =
      (data && (data.detail || data.error)) || `HTTP ${res.status}`;
    console.error("[intel-notify] bot notify failed:", detail);
    return { ok: false, detail: String(detail) };
  }

  return { ok: true, telegram: data.telegram };
}
