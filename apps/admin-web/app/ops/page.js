import { Shell } from "../components/Shell";
import { PublicEnvBar } from "../components/PublicEnvBar";

/** 每次请求在服务端拉取 /health，避免构建时写死结果 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "运维探测 · AI Employee Admin"
};

async function probeOrchestratorHealth() {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  const base = raw?.trim()?.replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      skipped: true,
      reason: "NEXT_PUBLIC_API_BASE_URL 未配置"
    };
  }
  const url = `${base}/health`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 0 }
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      http_status: res.status,
      url,
      json,
      body_preview: json ? null : text.slice(0, 500)
    };
  } catch (e) {
    return {
      ok: false,
      url,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

export default async function OpsPage() {
  const result = await probeOrchestratorHealth();

  return (
    <Shell active="ops">
      <PublicEnvBar />
      <div style={{ padding: "24px 0", maxWidth: 720, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: "1.25rem", marginTop: 0 }}>运维探测（Vercel → Railway）</h1>
        <p style={{ color: "#666", fontSize: "0.95rem" }}>
          本页在 <strong>Vercel 服务端</strong>请求{" "}
          <code>NEXT_PUBLIC_API_BASE_URL</code> + <code>/health</code>
          ，不经过浏览器直连，因此<strong>不要求</strong>在 orchestrator 配{" "}
          <code>CORS_ORIGIN</code> 也能看到结果。用于核对编排服务公网地址是否填对。
        </p>

        <h2 style={{ fontSize: "1.05rem", marginTop: 28 }}>Orchestrator <code>/health</code></h2>
        <pre
          style={{
            background: "#111",
            color: "#e6e6e6",
            padding: 16,
            borderRadius: 8,
            overflow: "auto",
            fontSize: 13
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>

        <p style={{ marginTop: 24, fontSize: "0.9rem", color: "#666" }}>
          期望：<code>http_status</code> 为 <code>200</code>，且 <code>json.service</code> 为{" "}
          <code>orchestrator-service</code>。若为 <code>404</code> 且线上报 Application
          not found，说明 <code>NEXT_PUBLIC_API_BASE_URL</code> 不是当前 orchestrator
          在 Railway Networking 里的公网根地址。
        </p>
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          <a href="/ecosystem" style={{ color: "#0066cc" }}>
            ← 返回生态总览
          </a>
        </p>
      </div>
    </Shell>
  );
}
