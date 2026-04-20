import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone, vehicle, last_contacted_at, status, source')
    .order('last_contacted_at', { ascending: true, nullsFirst: true })
    .limit(200);

  if (error) {
    return (
      <div className="px-8 py-8">
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Supabase error: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-mute-300 text-sm mt-1">
            {(data ?? []).length} scraped records. Oldest contact first.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-ink-700 bg-ink-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-mute-400 bg-ink-900">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Last contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c, i) => (
              <tr
                key={c.id}
                className={`border-t border-ink-700 ${i % 2 === 0 ? 'bg-ink-800' : 'bg-ink-900/40'} hover:bg-ink-700 transition-colors`}
              >
                <td className="px-4 py-3 font-medium text-white">
                  {c.first_name} {c.last_name}
                </td>
                <td className="px-4 py-3 text-mute-200">{c.vehicle ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-mute-200">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-mute-300">{c.last_contacted_at ?? '—'}</td>
                <td className="px-4 py-3">
                  {c.status ? (
                    <span className="inline-flex rounded-md bg-ink-900 border border-ink-700 px-2 py-0.5 text-xs text-mute-200">
                      {c.status}
                    </span>
                  ) : (
                    <span className="text-mute-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-mute-300">{c.source ?? '—'}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-mute-300">
                  No customers yet. Run the extension on your CRM tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
