import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import { dealer, gamePlans, weeklyStats as w } from "@/lib/mock";

export default function DashboardPage() {
  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="serif dash-title">Welcome back, Eddie.</div>
          <div className="mono dash-sub">{dealer.name} · Week of Apr 27</div>
        </div>
        <Link href="/game-plans/new" className="btn-primary">+ New Game Plan</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-num serif">{w.sent}</div><div className="kpi-lbl mono">SENT THIS WEEK</div></div>
        <div className="kpi"><div className="kpi-num serif">{w.replies}</div><div className="kpi-lbl mono">REPLIES</div></div>
        <div className="kpi"><div className="kpi-num serif">{w.reply_rate}%</div><div className="kpi-lbl mono">REPLY RATE</div></div>
        <div className="kpi"><div className="kpi-num serif">{w.appointments}</div><div className="kpi-lbl mono">APPTS SET</div></div>
        <div className="kpi"><div className="kpi-num serif">{w.sold}</div><div className="kpi-lbl mono">SOLD</div></div>
        <div className="kpi accent">
          <div className="kpi-num serif">${(w.revenue_attributed / 1000).toFixed(0)}k</div>
          <div className="kpi-lbl mono">REVENUE ATTRIBUTED</div>
        </div>
      </div>

      <div className="plans-block">
        <div className="plans-head">
          <h3 className="serif">Active Game Plans</h3>
          <Link href="/game-plans/new">Build new →</Link>
        </div>
        <div className="plans-grid">
          {gamePlans.map((p) => (
            <div key={p.id} className="plan-card">
              <div className="plan-row1">
                <StatusPill status={p.status} />
                <span className="mono plan-date">{p.created}</span>
              </div>
              <div className="serif plan-name">{p.name}</div>
              <div className="plan-stats mono">
                <span>{p.pool_size} pool</span>
                <span>{p.sent} sent</span>
                <span>{p.replies} replies</span>
                <span className="strong">{p.appointments} appts</span>
              </div>
              {p.offer && <div className="plan-offer">&quot;{p.offer}&quot;</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
