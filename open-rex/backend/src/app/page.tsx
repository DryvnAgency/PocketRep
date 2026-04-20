import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function getStats() {
  const supabase = getServerSupabase();
  const [{ count: customers }, { count: pending }, { count: sent }] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('drafts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('drafts').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
  ]);
  return {
    customers: customers ?? 0,
    pendingDrafts: pending ?? 0,
    sent: sent ?? 0,
  };
}

export default async function DashboardPage() {
  let stats = { customers: 0, pendingDrafts: 0, sent: 0 };
  let error: string | null = null;
  try {
    stats = await getStats();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Supabase not configured';
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Supabase not reachable: {error}. Fill in env vars in backend/.env.local.
        </div>
      )}
      <section className="grid grid-cols-3 gap-4">
        <StatCard label="Customers" value={stats.customers} />
        <StatCard label="Pending drafts" value={stats.pendingDrafts} />
        <StatCard label="Sent" value={stats.sent} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Next steps</h2>
        <ol className="list-decimal pl-5 text-sm text-neutral-700 space-y-1">
          <li>Create the Supabase project and run backend/supabase/schema.sql.</li>
          <li>Fill backend/.env.local with Supabase, Gemini, Twilio keys.</li>
          <li>Build and load the Chrome extension, then click Open Rex on a VinSolutions tab.</li>
          <li>Approve drafts on the Drafts page to send SMS.</li>
        </ol>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </div>
  );
}
