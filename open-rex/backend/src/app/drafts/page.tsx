import { getServerSupabase } from '@/lib/supabase';
import DraftsWorkspace from './DraftsWorkspace';

export const dynamic = 'force-dynamic';

export default async function DraftsPage() {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from('drafts')
    .select(`
      id, customer_id, body, status, generated_at, is_appointment_signal,
      customers ( id, first_name, last_name, phone, email, vehicle,
                  last_contacted_at, status, source )
    `)
    .eq('status', 'pending')
    .order('generated_at', { ascending: false })
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

  const drafts = (data ?? []).map((d: any) => ({
    id: d.id,
    customerId: d.customer_id,
    body: d.body,
    generatedAt: d.generated_at,
    isAppointmentSignal: d.is_appointment_signal,
    customer: Array.isArray(d.customers) ? d.customers[0] : d.customers,
  }));

  return <DraftsWorkspace initialDrafts={drafts} />;
}
