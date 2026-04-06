"use client";

function Pill({ label, ok }) {
  return (
    <span className="ae-pill" data-ok={ok ? "true" : "false"}>
      {label}
      {ok ? " · 已配置" : " · 未配置"}
    </span>
  );
}

export function PublicEnvBar() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const api = process.env.NEXT_PUBLIC_API_BASE_URL;

  return (
    <div className="ae-envbar" role="status" aria-label="前端公开环境变量">
      <Pill label="NEXT_PUBLIC_SUPABASE_URL" ok={Boolean(url?.trim())} />
      <Pill label="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ok={Boolean(key?.trim())} />
      <Pill label="NEXT_PUBLIC_API_BASE_URL" ok={Boolean(api?.trim())} />
    </div>
  );
}
