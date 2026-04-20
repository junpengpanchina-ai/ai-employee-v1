import cron from "node-cron";
import { runIntelScheduledPush } from "./intelScheduledPush.js";

let schedulerStarted = false;

function envFlagTrue(name) {
  return ["true", "1", "yes"].includes(
    String(process.env[name] ?? "").trim().toLowerCase()
  );
}

function envFlagFalse(name) {
  return ["false", "0", "no", "off"].includes(
    String(process.env[name] ?? "").trim().toLowerCase()
  );
}

/** 与 HTTP push / notify 相同的最低配置（不设则无法推 Telegram） */
function intelPushDepsConfigured() {
  const chat = String(process.env.TELEGRAM_BOSS_CHAT_ID ?? "").trim();
  const botBase = String(process.env.BOT_SERVICE_BASE_URL ?? "").trim();
  const secret = String(
    process.env.BOT_INTERNAL_SECRET ||
      process.env.ORCHESTRATOR_INTERNAL_SECRET ||
      ""
  ).trim();
  return Boolean(chat && botBase && secret);
}

/**
 * 是否启用进程内定时推送。
 * - 未设置：已配齐 TELEGRAM_BOSS_CHAT_ID + BOT_SERVICE_BASE_URL + 内部密钥 → **自动开**（方式 A）
 * - 显式 `true` / `false` 等：按字面优先
 */
function isIntelAutoPushEnabled() {
  const raw = String(process.env.INTEL_AUTO_PUSH_ENABLED ?? "").trim();
  if (raw === "") {
    return intelPushDepsConfigured();
  }
  if (envFlagFalse("INTEL_AUTO_PUSH_ENABLED")) return false;
  if (envFlagTrue("INTEL_AUTO_PUSH_ENABLED")) return true;
  return false;
}

/**
 * 进程内定时推送（不依赖 Railway / 外部 Cron）。
 * 见 `isIntelAutoPushEnabled()`；与 `POST /internal/intel/push` 同源。
 */
export function startIntelAutoPushScheduler() {
  if (schedulerStarted) {
    return;
  }
  if (!isIntelAutoPushEnabled()) {
    return;
  }
  if (!intelPushDepsConfigured()) {
    console.warn(
      "[intel-auto-push] enabled but TELEGRAM_BOSS_CHAT_ID / BOT_SERVICE_BASE_URL / internal secret incomplete — not starting scheduler"
    );
    return;
  }

  const tz =
    String(process.env.INTEL_AUTO_PUSH_TZ || process.env.TZ || "").trim() ||
    undefined;
  const cronMorning =
    String(process.env.INTEL_AUTO_PUSH_CRON_MORNING || "0 8 * * *").trim();
  const cronNoon =
    String(process.env.INTEL_AUTO_PUSH_CRON_NOON || "0 12 * * *").trim();
  const cronNight =
    String(process.env.INTEL_AUTO_PUSH_CRON_NIGHT || "0 21 * * *").trim();
  const syncFirst = envFlagTrue("INTEL_AUTO_PUSH_SYNC_FIRST");

  const jobs = [
    { expr: cronMorning, slot: /** @type {const} */ ("morning") },
    { expr: cronNoon, slot: /** @type {const} */ ("noon") },
    { expr: cronNight, slot: /** @type {const} */ ("night") }
  ];

  const scheduleOpts = tz ? { timezone: tz } : {};
  let scheduledCount = 0;

  for (const { expr, slot } of jobs) {
    if (!cron.validate(expr)) {
      console.error(
        "[intel-auto-push] invalid cron expression, skip:",
        slot,
        expr
      );
      continue;
    }
    cron.schedule(
      expr,
      async () => {
        try {
          const r = await runIntelScheduledPush({ slot, syncFirst });
          console.log("[intel-auto-push] tick", {
            slot,
            ok: r.ok,
            delivered: r.delivered,
            telegram: r.telegram
          });
        } catch (e) {
          console.error("[intel-auto-push] tick failed", slot, e);
        }
      },
      scheduleOpts
    );
    scheduledCount += 1;
  }

  if (scheduledCount === 0) {
    console.error(
      "[intel-auto-push] enabled but no valid cron — check INTEL_AUTO_PUSH_CRON_*"
    );
    return;
  }

  schedulerStarted = true;

  const rawFlag = String(process.env.INTEL_AUTO_PUSH_ENABLED ?? "").trim();
  const mode =
    rawFlag === "" ? "auto_when_push_env_ready" : "explicit_on";

  console.log("[intel-auto-push] in-process scheduler ON", {
    mode,
    timezone: tz || "(server local)",
    cron_morning: cronMorning,
    cron_noon: cronNoon,
    cron_night: cronNight,
    sync_first: syncFirst
  });
}
