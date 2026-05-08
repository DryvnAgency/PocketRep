import { auditLog } from "@/lib/mock";

export default function AuditPage() {
  return (
    <div className="audit">
      <div className="audit-head">
        <div>
          <div className="serif audit-title">Audit Vault</div>
          <div className="mono audit-sub">
            Append-only · mirrored to S3 object-lock · court-formatted PDF available
          </div>
        </div>
        <button className="btn-primary">Export Selected as PDF</button>
      </div>
      <div className="audit-table">
        <div className="audit-rh mono">
          <span>TIMESTAMP</span><span>ACTOR</span><span>EVENT</span><span>TARGET</span><span>DETAIL</span>
        </div>
        {auditLog.map((e, i) => (
          <div key={i} className={"audit-row event-" + e.event}>
            <span className="mono">{e.ts}</span>
            <span>{e.actor}</span>
            <span className="mono audit-event">{e.event}</span>
            <span className="mono">{e.target}</span>
            <span>{e.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
