import { getServerSupabase } from '@/lib/supabase';
import DraftRow from './DraftRow';

export const dynamic = 'force-dynamic';

export default async function DraftsPage() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('drafts')
    .select('id, customer_id, body, status, generated_at, customers(first_name, last_name, phone, vehicle)')
    .eq('status', 'pending')
    .order('generated_at', { ascending: false })
    .limit(100);

  if (error) {
    return <div className="text-sm text-red-600">Supabase error: {error.message}</div>;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Pending drafts</h2>
      {(data ?? []).length === 0 && (
        <div className="text-sm text-neutral-500">No pending drafts. Generate some from the Customers page.</div>
      )}
      {(data ?? []).map((d: any) => (
        <DraftRow key={d.id} draft={d} />
      ))}
    </section>
  );
}
