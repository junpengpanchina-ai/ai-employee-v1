/**
 * 可选保护内部调试路由：设置 ORCHESTRATOR_INTERNAL_SECRET 后，
 * 请求须带 Header：`X-Orchestrator-Secret: <secret>` 或 `Authorization: Bearer <secret>`。
 * 未设置密钥时路由对可达网络开放（与 /internal/ingest/telegram 历史行为一致，由部署侧网络隔离）。
 * @param {import("express").Request} req
 * @returns {{ ok: boolean, status?: number, body?: Record<string, unknown> }}
 */
export function checkInternalSecret(req) {
  const secret = (process.env.ORCHESTRATOR_INTERNAL_SECRET || "").trim();
  if (!secret) {
    return { ok: true };
  }
  const h =
    (req.headers["x-orchestrator-secret"] &&
      String(req.headers["x-orchestrator-secret"])) ||
    "";
  const auth = req.headers.authorization || "";
  const bearer =
    auth.startsWith("Bearer ") || auth.startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
  const token = h || bearer;
  if (token !== secret) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "unauthorized",
        detail: "invalid or missing internal secret"
      }
    };
  }
  return { ok: true };
}
