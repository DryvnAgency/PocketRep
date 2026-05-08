import StatusPill from "@/components/StatusPill";
import { conversations } from "@/lib/mock";

export default function RepPage() {
  const assigned = conversations.filter((c) => c.assigned_to);
  return (
    <div className="rep-wrap">
      <div className="rep-phone">
        <div className="rep-status mono">9:41 · Rep · Jordan V.</div>
        <div className="rep-head">
          <div className="serif rep-title">Your Hot List</div>
          <div className="mono rep-count">{assigned.length} active</div>
        </div>
        <div className="rep-list">
          {assigned.map((c) => (
            <div key={c.id} className="rep-card">
              <div className="rep-row1">
                <span className="serif">
                  {c.customer.first} {c.customer.last}
                </span>
                <StatusPill status={c.status} />
              </div>
              <div className="mono rep-meta">
                {c.customer.vehicle} · {c.customer.months}mo
              </div>
              <div className="rep-msg">&quot;{c.last_msg_preview}&quot;</div>
              <div className="rep-actions">
                <button className="btn-primary rep-btn">Open Thread</button>
                <button className="btn-ghost rep-btn">Call</button>
              </div>
            </div>
          ))}
          {assigned.length === 0 && <div className="rep-empty">No assignments yet — check back.</div>}
        </div>
      </div>
      <div className="rep-side">
        <h3 className="serif">Rep Mobile App</h3>
        <p className="muted">
          Reps receive assigned conversations as push notifications with full customer context and a pre-drafted opener ready to send. Built React Native via Expo.
        </p>
        <ul className="rep-features mono">
          <li>› Push on assignment</li>
          <li>› Full thread + customer context</li>
          <li>› One-tap call · one-tap appointment set</li>
          <li>› No outbound campaign tools (manager-only)</li>
        </ul>
      </div>
    </div>
  );
}
