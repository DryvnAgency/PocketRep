import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('appointment_signals')
    .select(`
      id, created_at, acknowledged_at,
      customers ( id, first_name, last_name, phone, vehicle )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

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
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Appointment signals</h1>
        <p className="text-mute-300 text-sm mt-1">
          Inbound replies where Rex detected the customer wants to come in.
        </p>
      </header>

      <div className="space-y-3">
        {(data ?? []).length === 0 && (
          <div className="rounded-xl border border-ink-700 bg-ink-800 p-8 text-center text-mute-300 text-sm">
            No appointment signals yet. They'll appear here when a customer
            reply includes a clear intent to come in.
          </div>
        )}
        {(data ?? []).map((row: any) => {
          const c = Array.isArray(row.customers) ? row.customers[0] : row.customers;
          const name = c ? `${c.first_name} ${c.last_name}` : 'Unknown';
          const ack = row.acknowledged_at;
          return (
            <div key={row.id} className={`rounded-xl border p-4 flex items-center justify-between ${
              ack ? 'border-ink-700 bg-ink-800/50' : 'border-rex-pink/30 bg-rex-pink/5 shadow-rex-glow'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${ack ? 'bg-mute-400' : 'bg-rex-pink rex-pulse'}`}></span>
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs text-mute-300">{c?.phone}</span>
                </div>
                <div className="text-xs text-mute-300 mt-1">
                  Vehicle: {c?.vehicle ?? '—'} · Detected {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                ack ? 'text-mute-400' : 'text-rex-pink2'
              }`}>
                {ack ? 'Acknowledged' : 'Needs attention'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
