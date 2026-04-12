import { Shell } from "../components/Shell";
import { PublicEnvBar } from "../components/PublicEnvBar";

export const metadata = {
  title: "情报流 · WorldMonitor · AI Employee Admin"
};

const WM_REPO = "https://github.com/koala73/worldmonitor";
const WM_DOCS = "https://www.worldmonitor.app/docs/documentation";

/** 主链：WM 供料 → 编排调取与摘要 → bot 推送 → 老板在 Telegram 知悉结论（admin-web 嵌入为辅助） */
const INTEL_FLOW = [
  { name: "WorldMonitor", sub: "资讯汇集（供给）" },
  { name: "orchestrator", sub: "调取 · GRSAI 摘要" },
  { name: "bot-service", sub: "推送结论" },
  { name: "Telegram", sub: "老板知悉" }
];

export default function WorldMonitorPage() {
  const embedUrl = (process.env.NEXT_PUBLIC_WORLDMONITOR_URL || "").trim();

  return (
    <Shell active="worldmonitor">
      <h1 className="ae-page-title">情报流（WorldMonitor）</h1>
      <p className="ae-page-sub">
        对接{" "}
        <a href={WM_REPO} target="_blank" rel="noreferrer">
          koala73/worldmonitor
        </a>{" "}
        提供<strong>持续资讯</strong>；本司系统在 <strong>orchestrator</strong> 调取、用模型整理后，由{" "}
        <strong>机器人</strong>在 <strong>Telegram</strong> 向老板说明<strong>当前判断</strong>。
        <strong> Bot / 编排侧 Token 与内部 API 不向 WM 开放</strong>（见{" "}
        <code>docs/worldmonitor-integration.md</code> 安全边界）。WM 独立部署（生产可 <strong>Railway</strong>{" "}
        第三 Service），步骤见 <code>docs/worldmonitor-railway.md</code>。
      </p>

      <PublicEnvBar />

      <h2 className="ae-section-title">主链（供料 → 加工 → 汇报）</h2>
      <div className="ae-flow" role="list">
        {INTEL_FLOW.map((step, i) => (
          <span key={`${step.name}-${i}`} style={{ display: "contents" }}>
            {i > 0 ? (
              <div className="ae-flow-arrow" aria-hidden="true">
                →
              </div>
            ) : null}
            <div className="ae-flow-step" role="listitem">
              <strong>{step.name}</strong>
              <span>{step.sub}</span>
            </div>
          </span>
        ))}
      </div>

      <h2 className="ae-section-title">参与方</h2>
      <div className="ae-grid">
        <article className="ae-card">
          <div className="ae-card-head">
            <h3 className="ae-card-title">WorldMonitor</h3>
            <span className="ae-card-platform">独立仓库 · AGPL-3.0</span>
          </div>
          <span className="ae-status" data-tier="model">
            供给层
          </span>
          <p className="ae-card-role">
            持续汇集资讯与信号；<strong>不向老板直接汇报结论</strong>——结论由 orchestrator
            + 机器人生成后在 Telegram 送达。
          </p>
          <p className="ae-card-foot">
            本地启动：<code>npm run dev</code> → 默认端口{" "}
            <code>5173</code>（与 admin-web 3000 不冲突）。
          </p>
        </article>
        <article className="ae-card">
          <div className="ae-card-head">
            <h3 className="ae-card-title">本后台（admin-web）</h3>
            <span className="ae-card-platform">Vercel · 辅助</span>
          </div>
          <span className="ae-status" data-tier="dev">
            工程层
          </span>
          <p className="ae-card-role">
            示意图与可选嵌入 WM；<strong>老板日常以 Telegram 结论为主</strong>，此处不替代 bot
            出口。
          </p>
          <p className="ae-card-foot">
            配置 <code>NEXT_PUBLIC_WORLDMONITOR_URL</code> 后可嵌 iframe（若目标站允许）。
          </p>
        </article>
      </div>

      <h2 className="ae-section-title">快捷链接</h2>
      <p style={{ color: "var(--ae-muted)", fontSize: "0.9rem" }}>
        <a href={WM_REPO} target="_blank" rel="noreferrer">
          GitHub 仓库
        </a>
        {" · "}
        <a href={WM_DOCS} target="_blank" rel="noreferrer">
          官方文档
        </a>
        {embedUrl ? (
          <>
            {" · "}
            <a href={embedUrl} target="_blank" rel="noreferrer">
              打开已配置的实例
            </a>
          </>
        ) : null}
      </p>

      <h2 className="ae-section-title">嵌入预览</h2>
      {embedUrl ? (
        <div
          className="ae-wm-frame-wrap"
          style={{
            marginTop: "0.75rem",
            border: "1px solid var(--ae-border)",
            borderRadius: "var(--ae-radius)",
            overflow: "hidden",
            background: "var(--ae-surface)"
          }}
        >
          <iframe
            title="WorldMonitor"
            src={embedUrl}
            style={{
              width: "100%",
              minHeight: "min(70vh, 720px)",
              border: "none",
              display: "block"
            }}
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
          />
        </div>
      ) : (
        <p
          className="ae-card-foot"
          style={{
            marginTop: "0.5rem",
            padding: "1rem",
            background: "var(--ae-surface-2)",
            borderRadius: "var(--ae-radius)",
            border: "1px dashed var(--ae-border)"
          }}
        >
          未设置 <code>NEXT_PUBLIC_WORLDMONITOR_URL</code>。本地可先启动 WM（
          <code>localhost:5173</code>
          ），再在 <code>.env.local</code> 中写入{" "}
          <code>NEXT_PUBLIC_WORLDMONITOR_URL=http://localhost:5173</code>{" "}
          并重启 <code>next dev</code>（生产需 https 与目标站允许嵌入）。
        </p>
      )}

      <footer className="ae-legend" style={{ marginTop: "2rem" }}>
        完整规划见仓库 <code>docs/worldmonitor-plan.md</code>；Cursor Skill 见{" "}
        <code>.cursor/skills/worldmonitor-intel/SKILL.md</code>。
      </footer>
    </Shell>
  );
}
