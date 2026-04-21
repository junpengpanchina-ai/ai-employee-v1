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

/** 与 HTTP push / notify 相同的最低配置 */
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

function pushEnvSnapshot() {
  return {
    TELEGRAM_BOSS_CHAT_ID: Boolean(
      String(process.env.TELEGRAM_BOSS_CHAT_ID ?? "").trim()
    ),
    BOT_SERVICE_BASE_URL: Boolean(
      String(process.env.BOT_SERVICE_BASE_URL ?? "").trim()
    ),
    has_BOT_INTERNAL_SECRET: Boolean(
      String(process.env.BOT_INTERNAL_SECRET ?? "").trim()
    ),
    has_ORCHESTRATOR_INTERNAL_SECRET: Boolean(
      String(process.env.ORCHESTRATOR_INTERNAL_SECRET ?? "").trim()
    )
  };
}

/**
 * 未设置 INTEL_AUTO_PUSH_TZ / TZ 时默认 **Asia/Shanghai**，避免 Railway（UTC）上 8 点变成北京时间 16 点。
 */
function resolveCronTimezone() {
  const cand = String(
    process.env.INTEL_AUTO_PUSH_TZ || process.env.TZ || "Asia/Shanghai"
  ).trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: cand });
    return cand;
  } catch {
    console.warn(
      "[intel-auto-push] invalid timezone, using UTC:",
      cand
    );
    return "UTC";
  }
}

/**
 * - 未设置 INTEL_AUTO_PUSH_ENABLED：配齐推送 env → 自动开
 * - 显式 false → 关；显式 true → 开（仍要求配齐 env 才注册）
 */
function isIntelAutoPushEnabled() {
  const raw = String(process.env.INTEL_AUTO_PUSH_ENABLED ?? "").trim();
  if (raw === "") {
    return intelPushDepsConfigured();
  }
  if (envFlagFalse("INTEL_AUTO_PUSH_ENABLED")) return false;
  if (envFlagTrue("INTEL_AUTO_PUSH_ENABLED")) return true;
  console.warn(
    "[intel-auto-push] unknown INTEL_AUTO_PUSH_ENABLED, falling back to auto:",
    raw
  );
  return intelPushDepsConfigured();
}

/**
 * 进程内 8/12/21 推送；与 `POST /internal/intel/push` 同源。
 * @returns {{ started: boolean, reason?: string, detail?: Record<string, unknown> }}
 */
export function startIntelAutoPushScheduler() {
  if (schedulerStarted) {
    return { started: true, reason: "already_started" };
  }

  if (!isIntelAutoPushEnabled()) {
    const raw = String(process.env.INTEL_AUTO_PUSH_ENABLED ?? "").trim();
    if (raw !== "" && envFlagFalse("INTEL_AUTO_PUSH_ENABLED")) {
      return { started: false, reason: "explicit_disabled" };
    }
    return {
      started: false,
      reason: "missing_push_env",
      detail: pushEnvSnapshot()
    };
  }

  if (!intelPushDepsConfigured()) {
    return {
      started: false,
      reason: "missing_push_env",
      detail: pushEnvSnapshot()
    };
  }

  const tz = resolveCronTimezone();
  const scheduleOpts = { timezone: tz, scheduled: true };
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
    return {
      started: false,
      reason: "invalid_cron_all",
      detail: { cronMorning, cronNoon, cronNight }
    };
  }

  schedulerStarted = true;

  const rawFlag = String(process.env.INTEL_AUTO_PUSH_ENABLED ?? "").trim();
  const mode =
    rawFlag === "" ? "auto_when_push_env_ready" : "explicit_on";

  console.log("[intel-auto-push] in-process scheduler ON", {
    mode,
    timezone: tz,
    cron_morning: cronMorning,
    cron_noon: cronNoon,
    cron_night: cronNight,
    sync_first: syncFirst,
    note:
      "times follow timezone above (default Asia/Shanghai if INTEL_AUTO_PUSH_TZ unset)"
  });

  return { started: true, reason: "scheduled", detail: { timezone: tz, mode } };
}
