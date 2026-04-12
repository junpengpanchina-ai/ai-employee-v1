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
import {
  classifyInput,
  fixedReplyCommand,
  fixedReplyHealthCheck,
  sanitizeReplyText
} from "./replyPolicy.js";

dotenv.config();

const app = express();
app.use(corsMiddleware);
app.use(express.json());

const PORT = Number(process.env.PORT || process.env.ORCHESTRATOR_PORT || 8001);

const GRSAI_FAIL_REPLY =
  process.env.GRSAI_FAIL_REPLY || "（模型暂时不可用，请稍后再试。）";

function jsonIngestFail(res, httpStatus, { stage, error, detail, ...extra }) {
  return res.status(httpStatus).json({
    ok: false,
    stage,
    error,
    detail: detail != null ? String(detail) : null,
    ...extra
  });
}

function getReadyChecks() {
  return {
    has_supabase_url: Boolean((process.env.SUPABASE_URL || "").trim()),
    has_service_role: Boolean(
      (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    ),
    has_grsai_base: Boolean((process.env.GRSAI_BASE_URL || "").trim()),
    has_grsai_key: Boolean((process.env.GRSAI_API_KEY || "").trim()),
    has_bot_model: Boolean((process.env.BOT_MODEL || "").trim())
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "orchestrator-service",
    time: new Date().toISOString()
  });
});

/**
 * 静态配置就绪：仅检查关键环境变量是否存在，不做外网探测。
 */
app.get("/ready", (req, res) => {
  const checks = getReadyChecks();
  const ready = Object.values(checks).every(Boolean);
  const payload = {
    ok: ready,
    service: "orchestrator-service",
    status: ready ? "ready" : "not_ready",
    checks
  };
  res.status(ready ? 200 : 503).json(payload);
});

/**
 * bot-service 转发入口：pending job → GRSAI → messages → job 终态 → reply_text
 */
app.post("/internal/ingest/telegram", async (req, res) => {
  const body = req.body || {};
  const chatId = body.chatId;
  const text = body.text ?? "";
  const telegramUserId = body.telegramUserId;

  const inputKind = classifyInput(text);

  console.log("[orchestrator-service] pipeline: ingest_start", {
    chatId: chatId != null ? String(chatId) : null,
    text_len: String(text).length,
    input_kind: inputKind
  });

  if (chatId == null || chatId === "") {
    return jsonIngestFail(res, 400, {
      stage: "validation",
      error: "invalid_request",
      detail: "chatId is required"
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return jsonIngestFail(res, 503, {
      stage: "supabase",
      error: "supabase_not_configured",
      detail:
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing or empty"
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
    return jsonIngestFail(res, 500, {
      stage: "supabase",
      error: "ledger_pending_failed",
      detail: e.message || String(e)
    });
  }

  let replyText;
  let grsaiError;
  let grsaiSkipped = false;

  if (inputKind === "health_check") {
    const fixed = fixedReplyHealthCheck(text);
    if (fixed != null) {
      replyText = fixed;
      grsaiSkipped = true;
    } else {
      try {
        replyText = await callGRSAI({
          userText: text,
          classification: "short_chat"
        });
      } catch (e) {
        grsaiError = e.message || String(e);
        console.error("[orchestrator-service] callGRSAI:", e);
        replyText = GRSAI_FAIL_REPLY;
      }
    }
  } else if (inputKind === "command") {
    replyText = fixedReplyCommand(text);
    grsaiSkipped = true;
  } else {
    try {
      replyText = await callGRSAI({
        userText: text,
        classification:
          inputKind === "short_chat" ? "short_chat" : "manager_task"
      });
    } catch (e) {
      grsaiError = e.message || String(e);
      console.error("[orchestrator-service] callGRSAI:", e);
      replyText = GRSAI_FAIL_REPLY;
    }
  }

  replyText = sanitizeReplyText(replyText);

  const messageMeta = {
    job_id: jobId,
    source: "telegram",
    input_kind: inputKind,
    grsai_skipped: grsaiSkipped,
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
    return jsonIngestFail(res, 500, {
      stage: "supabase",
      error: "save_message_failed",
      detail: e.message || String(e),
      job_id: jobId
    });
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
    return jsonIngestFail(res, 500, {
      stage: "internal",
      error: "job_update_failed",
      detail: e.message || String(e),
      job_id: jobId,
      message_id: messageId,
      reply_text: replyText
    });
  }

  console.log("[orchestrator-service] ingest done:", {
    jobId,
    messageId,
    input_kind: inputKind,
    grsai_skipped: grsaiSkipped,
    ok: !grsaiError
  });

  if (grsaiError) {
    return res.status(200).json({
      ok: false,
      stage: "grsai",
      error: "grsai_error",
      detail: grsaiError,
      service: "orchestrator-service",
      job_id: jobId,
      message_id: messageId,
      reply_text: replyText,
      grsai_error: grsaiError,
      input_kind: inputKind,
      grsai_skipped: false
    });
  }

  return res.json({
    ok: true,
    stage: "done",
    service: "orchestrator-service",
    job_id: jobId,
    message_id: messageId,
    reply_text: replyText,
    grsai_error: null,
    input_kind: inputKind,
    grsai_skipped: grsaiSkipped
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
