/**
 * 浏览器跨域（Vercel admin-web → Railway orchestrator）可选。
 * 设置 CORS_ORIGIN 为逗号分隔的完整源，例如：https://xxx.vercel.app
 * 不设置则不做 CORS 头（bot-service 服务端 fetch 不受影响）。
 */
export function corsMiddleware(req, res, next) {
  const allowed = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    return next();
  }

  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
}
