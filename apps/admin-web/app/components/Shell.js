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
        </nav>
      </header>
      <div className="ae-main">{children}</div>
    </div>
  );
}
