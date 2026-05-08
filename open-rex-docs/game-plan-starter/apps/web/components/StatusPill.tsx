const MAP: Record<string, { label: string; color: string }> = {
  awaiting_approval: { label: "Awaiting You", color: "#C8442A" },
  ai_handled: { label: "AI Handled", color: "#6B7280" },
  assigned: { label: "Assigned", color: "#1F4F8C" },
  appointment_set: { label: "Appt Set", color: "#2D5234" },
  opted_out: { label: "Opted Out", color: "#8B0000" },
  running: { label: "RUNNING", color: "#2D5234" },
  draft: { label: "DRAFT", color: "#6B7280" },
  completed: { label: "COMPLETED", color: "#1F4F8C" },
};

export default function StatusPill({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, color: "#6B7280" };
  return (
    <span className="rx-pill" style={{ background: m.color }}>
      {m.label}
    </span>
  );
}
