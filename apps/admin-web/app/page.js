"use client";

import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    console.log(
      "NEXT_PUBLIC_SUPABASE_URL:",
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
    console.log(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY set:",
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    );
    console.log(
      "NEXT_PUBLIC_API_BASE_URL:",
      process.env.NEXT_PUBLIC_API_BASE_URL
    );
  }, []);

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        lineHeight: 1.5
      }}
    >
      <h1 style={{ fontSize: "1.25rem" }}>admin-web</h1>
      <p>占位页：打开浏览器开发者工具 → Console，确认上述 NEXT_PUBLIC_* 是否加载。</p>
      <p>
        配置：在 <code>apps/admin-web/</code> 下复制{" "}
        <code>.env.example</code> 为 <code>.env.local</code>，修改后需重启{" "}
        <code>npm run dev</code>。
      </p>
    </main>
  );
}
