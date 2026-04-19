import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

/**
 * orchestrator 定时推送等：经本服务代发 Telegram（不在 orchestrator 放 TELEGRAM_BOT_TOKEN）。
 */
function checkBotInternalNotifyAuth(req) {
  const want = String(
    process.env.BOT_INTERNAL_SECRET ||
      process.env.ORCHESTRATOR_INTERNAL_SECRET ||
      ""
  ).trim();
  if (!want) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: "notify_secret_not_configured",
        detail:
          "set BOT_INTERNAL_SECRET (or ORCHESTRATOR_INTERNAL_SECRET) on bot-service"
      }
    };
  }
  const got = String(
    req.headers["x-bot-internal-secret"] ?? ""
  ).trim();
  if (got !== want) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "unauthorized" }
    };
  }
  return { ok: true };
}

const PORT = Number(process.env.PORT || process.env.BOT_SERVICE_PORT || 8010);
/** 与 Telegram `setWebhook` 的 `secret_token` 对齐；空字符串表示未启用校验 */
const EXPECTED_WEBHOOK_SECRET = String(
  process.env.TELEGRAM_WEBHOOK_SECRET ?? ""
).trim();

/**
 * 供 fetch 使用：去尾斜杠；无协议时补全（公网默认 https，localhost/127.0.0.1 用 http）。
 */
function normalizeOrchestratorBaseUrl() {
  const raw = process.env.ORCHESTRATOR_BASE_URL;
  if (raw == null || String(raw).trim() === "") {
    return "http://localhost:8001";
  }
  let t = String(raw).trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(t)) {
    const isLocal =
      /^localhost\b/i.test(t) ||
      /^127\.\d+\.\d+\.\d+/.test(t) ||
      /^\[?::1\]?:/.test(t);
    t = `${isLocal ? "http" : "https"}://${t}`;
  }
  return t;
}

const ORCHESTRATOR_BASE_URL = normalizeOrchestratorBaseUrl();

const WEBHOOK_EVENT_CAP = 12;
/** @type {Array<{ at: string, kind: string, [k: string]: unknown }>} */
const recentWebhookEvents = [];

function envFlagTelegramSyncWebhook() {
  return ["true", "1", "yes"].includes(
    String(process.env.TELEGRAM_SYNC_WEBHOOK || "").trim().toLowerCase()
  );
}

function recordWebhookEvent(entry) {
  recentWebhookEvents.unshift({
    at: new Date().toISOString(),
    ...entry
  });
  while (recentWebhookEvents.length > WEBHOOK_EVENT_CAP) {
    recentWebhookEvents.pop();
  }
}

/**
 * 启动时向 Telegram 登记 Webhook，避免「Railway 里的 secret」与「手动 curl setWebhook」不一致。
 * 需设置 TELEGRAM_SYNC_WEBHOOK=true 与 BOT_PUBLIC_BASE_URL（https 根，无尾斜杠）。
 */
async function syncTelegramWebhookOnBoot() {
  if (!envFlagTelegramSyncWebhook()) {
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = String(
    process.env.BOT_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");

  if (!token || !base) {
    console.warn(
      "[bot-service] TELEGRAM_SYNC_WEBHOOK is set but TELEGRAM_BOT_TOKEN or BOT_PUBLIC_BASE_URL is missing; skip auto setWebhook"
    );
    return;
  }

  if (!/^https:\/\//i.test(base)) {
    console.warn(
      "[bot-service] BOT_PUBLIC_BASE_URL must start with https:// ; skip auto setWebhook"
    );
    return;
  }

  const webhookUrl = `${base}/telegram/webhook`;
  const params = new URLSearchParams();
  params.set("url", webhookUrl);
  if (EXPECTED_WEBHOOK_SECRET) {
    params.set("secret_token", EXPECTED_WEBHOOK_SECRET);
  }

  try {
    const r = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: params.toString()
      }
    );
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      console.log("[bot-service] TELEGRAM_SYNC_WEBHOOK ok", {
        webhook_url: webhookUrl,
        has_secret: Boolean(EXPECTED_WEBHOOK_SECRET)
      });
      recordWebhookEvent({
        kind: "boot_set_webhook",
        ok: true,
        has_secret: Boolean(EXPECTED_WEBHOOK_SECRET)
      });
    } else {
      console.error("[bot-service] TELEGRAM_SYNC_WEBHOOK failed", {
        description: j.description,
        error_code: j.error_code
      });
      recordWebhookEvent({
        kind: "boot_set_webhook",
        ok: false,
        error_code: j.error_code,
        description: j.description
      });
    }
  } catch (e) {
    console.error("[bot-service] TELEGRAM_SYNC_WEBHOOK error:", e);
    recordWebhookEvent({
      kind: "boot_set_webhook",
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    });
  }
}

async function forwardToOrchestrator(payload) {
  const url = `${ORCHESTRATOR_BASE_URL}/internal/ingest/telegram`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.detail || data.error || `orchestrator responded ${res.status}`
    );
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

/**
 * POST /internal/notify
 * Header: X-Bot-Internal-Secret（与 orchestrator 的 BOT_INTERNAL_SECRET 或 ORCHESTRATOR_INTERNAL_SECRET 一致）
 * Body: { "chat_id": "<telegram chat id>", "text": "…" }
 */
app.post("/internal/notify", async (req, res) => {
  const auth = checkBotInternalNotifyAuth(req);
  if (!auth.ok) {
    return res.status(auth.status || 401).json(auth.body);
  }
  const body = req.body || {};
  const chatId = body.chat_id ?? body.chatId;
  const text = body.text;
  if (chatId == null || chatId === "") {
    return res.status(400).json({
      ok: false,
      error: "invalid_request",
      detail: "chat_id is required"
    });
  }
  try {
    const telegram = await sendTelegramReply(chatId, text);
    return res.json({ ok: true, telegram });
  } catch (e) {
    console.error("[bot-service] /internal/notify:", e);
    return res.status(500).json({
      ok: false,
      error: "send_failed",
      detail: e.message || String(e)
    });
  }
});

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "bot-service",
    time: new Date().toISOString()
  });
});

/**
 * 运维快照：环境开关 + 最近 Webhook 处理摘要（无密钥、无聊天正文）
 */
app.get("/diagnostics", (req, res) => {
  const botBase = String(
    process.env.BOT_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || ""
  ).trim();
  res.json({
    ok: true,
    service: "bot-service",
    time: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    config: {
      orchestrator_base_url: ORCHESTRATOR_BASE_URL,
      bot_public_base_url_configured: Boolean(botBase),
      telegram_sync_webhook: envFlagTelegramSyncWebhook(),
      webhook_secret_configured: Boolean(EXPECTED_WEBHOOK_SECRET),
      telegram_bot_token_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegram_send_reply: process.env.TELEGRAM_SEND_REPLY ?? "(default true)"
    },
    recent_webhook_events: recentWebhookEvents
  });
});

// Telegram Webhook：校验后转发 orchestrator-service
app.post("/telegram/webhook", async (req, res) => {
  try {
    const rawHeader = req.headers["x-telegram-bot-api-secret-token"];
    const header_present = rawHeader !== undefined;
    const received = String(rawHeader ?? "").trim();
    const webhook_secret_set = Boolean(EXPECTED_WEBHOOK_SECRET);
    const received_len = received.length;
    const expected_len = EXPECTED_WEBHOOK_SECRET.length;

    if (webhook_secret_set && received !== EXPECTED_WEBHOOK_SECRET) {
      console.warn("[bot-service] webhook_secret_check", {
        webhook_secret_set,
        header_present,
        received_len,
        expected_len
      });
      recordWebhookEvent({
        kind: "secret_mismatch",
        header_present,
        received_len,
        expected_len
      });
      return res.status(401).json({
        ok: false,
        error: "telegram_webhook_secret_mismatch"
      });
    }

    const body = req.body || {};
    const message = body.message || body.edited_message;

    if (!message) {
      console.log("[bot-service] pipeline: skip_no_message", {
        update_keys: Object.keys(body).slice(0, 12)
      });
      recordWebhookEvent({
        kind: "skip_no_message",
        update_keys_count: Object.keys(body).length
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
    if (orchestrator?.ok === false) {
      console.log("[bot-service] pipeline: 3_orchestrator_failed", {
        stage: orchestrator.stage,
        error: orchestrator.error,
        detail:
          orchestrator.detail != null
            ? String(orchestrator.detail).slice(0, 500)
            : undefined,
        reply_text_len: replyText ? String(replyText).length : 0
      });
    } else {
      console.log("[bot-service] pipeline: 3_orchestrator_ok", {
        reply_text_len: replyText ? String(replyText).length : 0,
        has_reply_text: Boolean(replyText),
        stage: orchestrator?.stage
      });
    }

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

    recordWebhookEvent({
      kind: "message_handled",
      orchestrator_ok: orchestrator.ok !== false,
      orchestrator_stage: orchestrator.stage ?? null,
      orchestrator_error: orchestrator.error ?? null,
      has_reply_text: Boolean(replyText),
      telegram: telegram.skipped
        ? { skipped: true, reason: telegram.reason || "empty_or_send_failed" }
        : { ok: telegram.ok !== false }
    });

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
      details: error.details,
      stage: error.details?.stage,
      orchestrator_error: error.details?.error
    });
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    recordWebhookEvent({
      kind: "handler_error",
      http_status: status,
      message: error.message || String(error)
    });
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
    TELEGRAM_WEBHOOK_SECRET_set: Boolean(EXPECTED_WEBHOOK_SECRET),
    TELEGRAM_SEND_REPLY: process.env.TELEGRAM_SEND_REPLY ?? "(default true)"
  });
}

logStartupEnv();

const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  await syncTelegramWebhookOnBoot();
  app.listen(PORT, HOST, () => {
    console.log(`[bot-service] listening on http://${HOST}:${PORT}`);
    console.log(
      "[bot-service] boot: ORCHESTRATOR_BASE_URL (must be orchestrator Public Domain, not bot):",
      ORCHESTRATOR_BASE_URL
    );
    if (/\/xxxx\b/i.test(ORCHESTRATOR_BASE_URL) || /placeholder/i.test(ORCHESTRATOR_BASE_URL)) {
      console.warn(
        "[bot-service] boot: ORCHESTRATOR_BASE_URL looks like a placeholder; fix in Railway Variables"
      );
    }
    const botPublic = String(
      process.env.BOT_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || ""
    ).trim();
    if (botPublic) {
      try {
        const oHost = new URL(ORCHESTRATOR_BASE_URL).host;
        const bHost = new URL(
          /^https?:\/\//i.test(botPublic) ? botPublic : `https://${botPublic.replace(/\/$/, "")}`
        ).host;
        if (oHost === bHost) {
          console.warn(
            "[bot-service] boot: ORCHESTRATOR_BASE_URL points at the same host as BOT_PUBLIC_BASE_URL — must be the orchestrator-service domain, not bot-service"
          );
        }
      } catch {
        /* ignore URL parse errors */
      }
    }
    console.log("[bot-service] pipeline: boot", {
      ORCHESTRATOR_BASE_URL,
      TELEGRAM_SEND_REPLY: process.env.TELEGRAM_SEND_REPLY ?? "(default true)",
      token_set: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      webhook_secret_set: Boolean(EXPECTED_WEBHOOK_SECRET),
      telegram_sync_webhook: envFlagTelegramSyncWebhook()
    });
  });
}

start().catch((e) => {
  console.error("[bot-service] fatal:", e);
  process.exit(1);
});
