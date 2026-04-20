import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone, vehicle, last_contacted_at, status')
    .order('last_contacted_at', { ascending: true, nullsFirst: true })
    .limit(200);

  if (error) {
    return <div className="text-sm text-red-600">Supabase error: {error.message}</div>;
  }

  return (
    <section>
      <h2 className="text-lg font-medium mb-4">Customers</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Vehicle</th>
            <th className="py-2">Phone</th>
            <th className="py-2">Last contact</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2">{c.first_name} {c.last_name}</td>
              <td className="py-2">{c.vehicle ?? '—'}</td>
              <td className="py-2">{c.phone ?? '—'}</td>
              <td className="py-2">{c.last_contacted_at ?? '—'}</td>
              <td className="py-2">{c.status ?? '—'}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">No customers yet. Run the extension on your CRM tab.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
