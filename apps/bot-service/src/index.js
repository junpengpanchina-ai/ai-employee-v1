import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || process.env.BOT_SERVICE_PORT || 8010);
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const ORCHESTRATOR_BASE_URL = (
  process.env.ORCHESTRATOR_BASE_URL || "http://localhost:8001"
).replace(/\/$/, "");

async function forwardToOrchestrator(payload) {
  const url = `${ORCHESTRATOR_BASE_URL}/internal/ingest/telegram`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `orchestrator responded ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function sendTelegramReply(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { skipped: true, reason: "no TELEGRAM_BOT_TOKEN" };
  }
  if (!text) {
    return { skipped: true, reason: "empty reply_text" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4096)
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(data.description || `Telegram sendMessage HTTP ${res.status}`);
  }
  return { ok: true, message_id: data.result?.message_id };
}

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "bot-service",
    time: new Date().toISOString()
  });
});

// Telegram Webhook：校验后转发 orchestrator-service
app.post("/telegram/webhook", async (req, res) => {
  try {
    const rawSecretHeader =
      req.headers["x-telegram-bot-api-secret-token"] ?? "";
    const headerSecret = String(rawSecretHeader).trim();
    const expectedSecret = String(WEBHOOK_SECRET || "").trim();

    if (expectedSecret && headerSecret !== expectedSecret) {
      console.warn("[bot-service] pipeline: 0_secret_mismatch", {
        header_present: Boolean(String(rawSecretHeader).length),
        header_len: headerSecret.length,
        expected_len: expectedSecret.length
      });
      return res.status(401).json({ ok: false, error: "invalid webhook secret" });
    }

    const body = req.body || {};
    const message = body.message || body.edited_message;

    if (!message) {
      console.log("[bot-service] pipeline: skip_no_message", {
        update_keys: Object.keys(body).slice(0, 12)
      });
      return res.json({ ok: true, skipped: true, reason: "no message payload" });
    }

    const chatId = message.chat?.id;
    const text = message.text || "";
    const telegramUserId = message.from?.id;

    console.log("[bot-service] pipeline: 1_webhook_ok", {
      chatId,
      text_len: text.length
    });

    const ingestUrl = `${ORCHESTRATOR_BASE_URL}/internal/ingest/telegram`;
    console.log("[bot-service] pipeline: 2_forward_orchestrator", {
      url: ingestUrl
    });

    const orchestrator = await forwardToOrchestrator({
      chatId,
      text,
      telegramUserId,
      telegramUpdate: body
    });

    const replyText = orchestrator?.reply_text;
    console.log("[bot-service] pipeline: 3_orchestrator_ok", {
      reply_text_len: replyText ? String(replyText).length : 0,
      has_reply_text: Boolean(replyText)
    });

    const sendReply = process.env.TELEGRAM_SEND_REPLY !== "false";
    let telegram = { skipped: true };

    if (sendReply && replyText) {
      try {
        console.log("[bot-service] pipeline: 4_send_telegram_start");
        telegram = await sendTelegramReply(chatId, replyText);
        console.log("[bot-service] pipeline: 5_send_telegram_done", telegram);
      } catch (e) {
        console.error("[bot-service] sendTelegramReply:", e);
        telegram = { ok: false, error: e.message || String(e) };
      }
    } else if (!sendReply) {
      telegram = { skipped: true, reason: "TELEGRAM_SEND_REPLY=false" };
      console.log("[bot-service] pipeline: skip_send", telegram);
    } else {
      console.log("[bot-service] pipeline: skip_send", {
        reason: "empty_reply_text"
      });
    }

    return res.json({
      ok: true,
      service: "bot-service",
      orchestrator,
      telegram
    });
  } catch (error) {
    console.error("[bot-service] pipeline: error", {
      message: error.message || String(error),
      status: error.status,
      orchestrator_base_url: ORCHESTRATOR_BASE_URL,
      details: error.details
    });
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({
      ok: false,
      error: error.message || "unknown error",
      orchestrator_base_url: ORCHESTRATOR_BASE_URL
    });
  }
});

function logStartupEnv() {
  const on =
    process.env.LOG_LEVEL === "debug" ||
    process.env.APP_ENV === "local" ||
    process.env.APP_ENV === "development";
  if (!on) return;
  console.log("[bot-service] startup env (no secrets):", {
    PORT: String(PORT),
    ORCHESTRATOR_BASE_URL,
    TELEGRAM_BOT_TOKEN_set: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_WEBHOOK_SECRET_set: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    TELEGRAM_SEND_REPLY: process.env.TELEGRAM_SEND_REPLY ?? "(default true)"
  });
}

logStartupEnv();

const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`[bot-service] listening on http://${HOST}:${PORT}`);
  console.log("[bot-service] pipeline: boot", {
    ORCHESTRATOR_BASE_URL,
    TELEGRAM_SEND_REPLY: process.env.TELEGRAM_SEND_REPLY ?? "(default true)",
    token_set: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    webhook_secret_set: Boolean(WEBHOOK_SECRET)
  });
});
