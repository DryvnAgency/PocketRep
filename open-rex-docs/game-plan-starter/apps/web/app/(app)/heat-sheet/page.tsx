"use client";

import { useState } from "react";
import StatusPill from "@/components/StatusPill";
import { conversations, type ConvStatus } from "@/lib/mock";

type Filter = "all" | ConvStatus;

export default function HeatSheetPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState(conversations[0].id);
  const filtered = conversations.filter((c) => filter === "all" || c.status === filter);
  const selected = conversations.find((c) => c.id === selectedId) ?? filtered[0];
  const counts = {
    awaiting_approval: conversations.filter((c) => c.status === "awaiting_approval").length,
    ai_handled: conversations.filter((c) => c.status === "ai_handled").length,
    assigned: conversations.filter((c) => c.status === "assigned").length,
    appointment_set: conversations.filter((c) => c.status === "appointment_set").length,
  };

  return (
    <div className="hs">
      <div className="hs-toolbar">
        <div className="hs-title">
          <span className="serif">Heat Sheet</span>
          <span className="hs-sub">Live · {conversations.length} active</span>
        </div>
        <div className="hs-filters">
          {([
            { k: "all", label: "All" },
            { k: "awaiting_approval", label: `Awaiting You (${counts.awaiting_approval})` },
            { k: "ai_handled", label: `AI Handled (${counts.ai_handled})` },
            { k: "assigned", label: `Assigned (${counts.assigned})` },
            { k: "appointment_set", label: `Appt Set (${counts.appointment_set})` },
          ] as const).map((f) => (
            <button
              key={f.k}
              className={"hs-fbtn " + (filter === f.k ? "on" : "")}
              onClick={() => setFilter(f.k as Filter)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hs-grid">
        <div className="hs-list">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={"hs-row " + (selectedId === c.id ? "sel" : "")}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="hs-row-top">
                <span className="hs-name">
                  {c.customer.first} {c.customer.last}
                </span>
                <StatusPill status={c.status} />
              </div>
              <div className="hs-veh mono">
                {c.customer.vehicle} · {c.customer.months}mo
              </div>
              <div className="hs-prev">{c.last_msg_preview}</div>
              {c.flags.length > 0 && (
                <div className="hs-flags">
                  {c.flags.map((f) => (
                    <span key={f} className="hs-flag">{f}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <ConversationDetail key={selected?.id} conv={selected} />
      </div>
    </div>
  );
}

function ConversationDetail({ conv }: { conv: (typeof conversations)[number] | undefined }) {
  const [draftIdx, setDraftIdx] = useState(1);
  const [sent, setSent] = useState(false);
  if (!conv) return <div className="hs-detail empty">Select a conversation</div>;

  return (
    <div className="hs-detail">
      <div className="hs-detail-head">
        <div>
          <div className="serif hs-cust-name">
            {conv.customer.first} {conv.customer.last}
          </div>
          <div className="mono hs-cust-meta">
            {conv.customer.phone} · {conv.customer.vehicle} · {conv.customer.months}mo · equity {conv.customer.equity}
          </div>
        </div>
        <StatusPill status={conv.status} />
      </div>

      <div className="hs-thread">
        {conv.thread.map((m, i) => (
          <div key={i} className={"msg msg-" + m.dir + (m.from ? " from-" + m.from : "")}>
            <div className="msg-text">{m.text}</div>
            <div className="msg-meta mono">
              {m.ts}
              {m.from ? " · " + m.from : ""}
            </div>
          </div>
        ))}
      </div>

      {conv.drafts.length > 0 && !sent && (
        <div className="hs-drafts">
          <div className="hs-drafts-head mono">REX DRAFTS · pick one or edit</div>
          <div className="hs-drafts-tabs">
            {conv.drafts.map((d, i) => (
              <button
                key={i}
                className={"draft-tab " + (draftIdx === i ? "on" : "")}
                onClick={() => setDraftIdx(i)}
              >
                {d.tone}
              </button>
            ))}
          </div>
          <textarea className="draft-text" defaultValue={conv.drafts[draftIdx]?.text} key={draftIdx} />
          <div className="hs-actions">
            <button className="btn-ghost" onClick={() => setSent(true)}>Edit & Send</button>
            <button className="btn-primary" onClick={() => setSent(true)}>Approve & Send</button>
            <button className="btn-ghost">Assign to Rep ▾</button>
          </div>
        </div>
      )}
      {sent && <div className="hs-sent mono">✓ SENT · logged to audit · routed to Jordan Vasquez</div>}
      {conv.drafts.length === 0 && (
        <div className="hs-actions">
          <button className="btn-ghost">Jump In</button>
          <button className="btn-ghost">Reassign</button>
          <button className="btn-ghost">Close</button>
        </div>
      )}
    </div>
  );
}
