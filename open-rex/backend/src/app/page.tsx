import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function getStats() {
  const supabase = getServerSupabase();
  const [customers, pending, sent, appointments] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('drafts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('drafts').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
    supabase.from('appointment_signals').select('*', { count: 'exact', head: true }).is('acknowledged_at', null),
  ]);
  return {
    customers: customers.count ?? 0,
    pendingDrafts: pending.count ?? 0,
    sent: sent.count ?? 0,
    appointments: appointments.count ?? 0,
  };
}

export default async function DashboardPage() {
  let stats = { customers: 0, pendingDrafts: 0, sent: 0, appointments: 0 };
  let error: string | null = null;
  try {
    stats = await getStats();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Supabase not configured';
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-mute-300 text-sm mt-1">Reactivate dormant customers with on-brand SMS.</p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Supabase not reachable: {error}. Fill in env vars in <code className="font-mono text-xs">backend/.env.local</code>.
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard label="Customers" value={stats.customers} accent="pink" />
        <StatCard label="Pending drafts" value={stats.pendingDrafts} accent="purple" />
        <StatCard label="Sent" value={stats.sent} accent="success" />
        <StatCard label="Appointment signals" value={stats.appointments} accent="gradient" />
      </section>

      <section className="rounded-xl border border-ink-700 bg-ink-800 p-6">
        <h2 className="font-display text-lg font-semibold mb-3">Next steps</h2>
        <ol className="space-y-2.5 text-sm text-mute-200">
          <Step n={1}>Run <code className="font-mono text-xs text-rex-pink2">backend/supabase/schema.sql</code> in the Supabase SQL editor.</Step>
          <Step n={2}>Fill <code className="font-mono text-xs text-rex-pink2">backend/.env.local</code> with Supabase, Gemini, Twilio keys.</Step>
          <Step n={3}>Load the Chrome extension, open VinSolutions, click Open Rex.</Step>
          <Step n={4}>Review drafts on the <a className="text-rex-pink2 hover:underline" href="/drafts">Drafts</a> page — approve to send.</Step>
        </ol>
      </section>
    </div>
  );
}

type Accent = 'pink' | 'purple' | 'success' | 'gradient';

function StatCard({ label, value, accent }: { label: string; value: number; accent: Accent }) {
  const accentClass: Record<Accent, string> = {
    pink: 'bg-rex-pink/15 text-rex-pink2 border-rex-pink/20',
    purple: 'bg-rex-purple/15 text-rex-purple2 border-rex-purple/20',
    success: 'bg-success/15 text-success border-success/20',
    gradient: 'bg-rex-gradient-soft border-rex-purple/30 text-rex-purple2',
  };
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800 p-5">
      <div className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${accentClass[accent]}`}>
        {label}
      </div>
      <div className="mt-3 font-display text-4xl font-bold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-5 h-5 shrink-0 rounded-full bg-ink-700 text-mute-200 text-xs font-semibold flex items-center justify-center">{n}</span>
      <span>{children}</span>
    </li>
  );
}
