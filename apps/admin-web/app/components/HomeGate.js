"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 根路径：先返回 200 + 可见 HTML（便于区分「路由没起来」与「仅 env 未配」），
 * 再在客户端跳到 /ecosystem。
 */
export default function HomeGate() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/ecosystem");
  }, [router]);

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 480,
        lineHeight: 1.5
      }}
    >
      <h1 style={{ fontSize: "1.15rem", marginTop: 0 }}>admin-web 根路径已加载</h1>
      <p style={{ color: "#555" }}>
        正在跳转「生态总览」… 若未跳转，请点击下方链接（请使用{" "}
        <strong>/</strong>，不要手动访问 <strong>/index</strong>）。
      </p>
      <p>
        <Link href="/ecosystem" style={{ color: "#0066cc" }}>
          进入 /ecosystem →
        </Link>
      </p>
    </main>
  );
}
