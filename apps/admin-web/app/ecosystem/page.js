import { Fragment } from "react";
import { Shell } from "../components/Shell";
import { PublicEnvBar } from "../components/PublicEnvBar";

export const metadata = {
  title: "生态总览 · AI Employee Admin"
};

const FLOW = [
  { name: "Telegram", sub: "老板入口" },
  { name: "bot-service", sub: "Webhook / 回传" },
  { name: "orchestrator", sub: "编排中枢" },
  { name: "GRSAI", sub: "模型推理" },
  { name: "Supabase", sub: "事实账本" },
  { name: "Telegram", sub: "回复送达" }
];

const NODES = [
  {
    id: "telegram",
    title: "Telegram",
    platform: "Telegram Cloud",
    role: "老板入口与对话出口；Webhook 与 sendMessage。",
    tier: "edge",
    note: "密钥仅在 bot-service（后端）。"
  },
  {
    id: "railway-bot",
    title: "bot-service",
    platform: "Railway",
    role: "接收 Webhook，转发 orchestrator，按需调用 sendMessage。",
    tier: "runtime",
    note: "与 orchestrator 分服务部署；ORCHESTRATOR_BASE_URL 指向中枢公网地址。"
  },
  {
    id: "railway-orch",
    title: "orchestrator-service",
    platform: "Railway",
    role: "调用 GRSAI，写入 jobs / messages，返回 reply_text。",
    tier: "runtime",
    note: "承载 GRSAI 与 Supabase 服务端密钥。"
  },
  {
    id: "grsai",
    title: "GRSAI",
    platform: "模型聚合 API",
    role: "OpenAI 兼容 chat/completions；由 orchestrator 调用。",
    tier: "model",
    note: "BASE_URL / PATH / BOT_MODEL 需在云端与官方文档对齐。"
  },
  {
    id: "supabase",
    title: "Supabase",
    platform: "Postgres + Auth",
    role: "employees / jobs / messages / reports 等账本。",
    tier: "ledger",
    note: "后台仅用 service role；前端仅用 publishable + URL。"
  },
  {
    id: "vercel",
    title: "Vercel · admin-web",
    platform: "Vercel",
    role: "本后台：可视化管理与轻操作（当前为生态总览台）。",
    tier: "dev",
    note: "仅配置 NEXT_PUBLIC_*；不接模型、不写高权限库。"
  },
  {
    id: "cursor",
    title: "Cursor",
    platform: "研发环境",
    role: "开发与文档迭代；非生产运行层。",
    tier: "dev",
    note: "与 GitHub / 本地 runbook 配合。"
  }
];

function tierLabel(tier) {
  const map = {
    edge: "入口层",
    runtime: "运行层",
    model: "模型层",
    ledger: "账本层",
    dev: "工程层"
  };
  return map[tier] || tier;
}

export default function EcosystemPage() {
  return (
    <Shell active="ecosystem">
      <h1 className="ae-page-title">生态总览</h1>
      <p className="ae-page-sub">
        一屏看清 AI 员工公司 V1 的参与方、主链流向与职责边界。后续可在此挂载各服务健康度与关键指标。
      </p>

      <PublicEnvBar />

      <h2 className="ae-section-title">主链（V1）</h2>
      <div className="ae-flow" role="list">
        {FLOW.map((step, i) => (
          <Fragment key={`${step.name}-${i}`}>
            {i > 0 ? (
              <div className="ae-flow-arrow" aria-hidden="true">
                →
              </div>
            ) : null}
            <div className="ae-flow-step" role="listitem">
              <strong>{step.name}</strong>
              <span>{step.sub}</span>
            </div>
          </Fragment>
        ))}
      </div>

      <h2 className="ae-section-title">参与方与职责</h2>
      <div className="ae-grid">
        {NODES.map((n) => (
          <article key={n.id} className="ae-card">
            <div className="ae-card-head">
              <h3 className="ae-card-title">{n.title}</h3>
              <span className="ae-card-platform">{n.platform}</span>
            </div>
            <span className="ae-status" data-tier={n.tier}>
              {tierLabel(n.tier)}
            </span>
            <p className="ae-card-role">{n.role}</p>
            <p className="ae-card-foot">{n.note}</p>
          </article>
        ))}
      </div>

      <footer className="ae-legend">
        说明：本页为搭台阶段，不调用后端健康检查接口。本地联调见{" "}
        <code>docs/local-testing.md</code>；Railway 见 <code>docs/railway-minimal.md</code>；
        Vercel 生产部署见 <code>docs/vercel-admin-web.md</code>。
      </footer>
    </Shell>
  );
}
