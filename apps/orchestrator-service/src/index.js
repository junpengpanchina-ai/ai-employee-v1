import express from "express";
import dotenv from "dotenv";
import { callGRSAI } from "./grsai.js";
import { corsMiddleware } from "./cors.js";
import {
  getSupabase,
  saveJobPending,
  saveMessage,
  updateJob
} from "./ledger.js";

dotenv.config();

const app = express();
app.use(corsMiddleware);
app.use(express.json());

const PORT = Number(process.env.PORT || process.env.ORCHESTRATOR_PORT || 8001);

const GRSAI_FAIL_REPLY =
  process.env.GRSAI_FAIL_REPLY || "（模型暂时不可用，请稍后再试。）";

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "orchestrator-service",
    time: new Date().toISOString()
  });
});

/**
 * bot-service 转发入口：pending job → GRSAI → messages → job 终态 → reply_text
 */
app.post("/internal/ingest/telegram", async (req, res) => {
  const body = req.body || {};
  const chatId = body.chatId;
  const text = body.text ?? "";
  const telegramUserId = body.telegramUserId;

  if (chatId == null || chatId === "") {
    return res.status(400).json({
      ok: false,
      error: "chatId is required"
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({
      ok: false,
      error: "Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    });
  }

  const payload = {
    chatId,
    text,
    telegramUserId: telegramUserId ?? null,
    source: "telegram"
  };

  let jobId;
  try {
    jobId = await saveJobPending(supabase, { payload });
  } catch (e) {
    console.error("[orchestrator-service] saveJobPending:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }

  let replyText;
  let grsaiError;
  try {
    replyText = await callGRSAI({ userText: text });
  } catch (e) {
    grsaiError = e.message || String(e);
    console.error("[orchestrator-service] callGRSAI:", e);
    replyText = GRSAI_FAIL_REPLY;
  }

  const messageMeta = {
    job_id: jobId,
    source: "telegram",
    grsai_error: grsaiError || null
  };

  let messageId;
  try {
    messageId = await saveMessage(supabase, {
      chat_id: String(chatId),
      telegram_user_id:
        telegramUserId != null ? String(telegramUserId) : null,
      user_text: text || null,
      reply_text: replyText,
      message_meta: messageMeta
    });
  } catch (e) {
    console.error("[orchestrator-service] saveMessage:", e);
    try {
      await updateJob(supabase, jobId, {
        status: "failed",
        error_message: `messages ledger failed: ${e.message}`,
        result: { reply_text: replyText, grsai_error: grsaiError || null }
      });
    } catch (e2) {
      console.error("[orchestrator-service] updateJob after message fail:", e2);
    }
    return res.status(500).json({ ok: false, error: e.message, job_id: jobId });
  }

  try {
    if (grsaiError) {
      await updateJob(supabase, jobId, {
        status: "failed",
        error_message: grsaiError,
        result: { reply_text: replyText, message_id: messageId }
      });
    } else {
      await updateJob(supabase, jobId, {
        status: "succeeded",
        error_message: null,
        result: { reply_text: replyText, message_id: messageId }
      });
    }
  } catch (e) {
    console.error("[orchestrator-service] updateJob:", e);
    return res.status(500).json({
      ok: false,
      error: e.message,
      job_id: jobId,
      message_id: messageId,
      reply_text: replyText
    });
  }

  console.log("[orchestrator-service] ingest done:", {
    jobId,
    messageId,
    ok: !grsaiError
  });

  return res.json({
    ok: true,
    service: "orchestrator-service",
    job_id: jobId,
    message_id: messageId,
    reply_text: replyText,
    grsai_error: grsaiError || null
  });
});

function logStartupEnv() {
  const on =
    process.env.LOG_LEVEL === "debug" ||
    process.env.APP_ENV === "local" ||
    process.env.APP_ENV === "development";
  if (!on) return;
  console.log("[orchestrator-service] startup env (no secrets):", {
    PORT: String(PORT),
    GRSAI_API_KEY_set: Boolean(process.env.GRSAI_API_KEY),
    GRSAI_BASE_URL_set: Boolean(process.env.GRSAI_BASE_URL),
    GRSAI_COMPLETIONS_PATH:
      process.env.GRSAI_COMPLETIONS_PATH || "(code default)",
    SUPABASE_URL_set: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY_set: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    BOT_MODEL: process.env.BOT_MODEL || "(code default)",
    CORS_ORIGIN_set: Boolean((process.env.CORS_ORIGIN || "").trim())
  });
}

logStartupEnv();

const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(
    `[orchestrator-service] listening on http://${HOST}:${PORT}`
  );
});
