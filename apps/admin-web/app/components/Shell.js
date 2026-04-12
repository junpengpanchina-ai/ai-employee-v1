import Link from "next/link";

export function Shell({ children, active }) {
  return (
    <div className="ae-shell">
      <header className="ae-header">
        <div className="ae-brand">
          AI Employee <span>· 管理后台</span>
        </div>
        <nav className="ae-nav" aria-label="主导航">
          <Link href="/ecosystem" data-active={active === "ecosystem" ? "true" : "false"}>
            生态总览
          </Link>
          <Link href="/ops" data-active={active === "ops" ? "true" : "false"}>
            运维探测
          </Link>
          <Link
            href="/worldmonitor"
            data-active={active === "worldmonitor" ? "true" : "false"}
          >
            情报流
          </Link>
        </nav>
      </header>
      <div className="ae-main">{children}</div>
    </div>
  );
}
