import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ContactNurture = {
  id: string;
  message_text: string;
  language: 'en' | 'es';
  hook_used: string;
  trigger_type: string;
  sent_at: string | null;
  scheduled_for: string | null;
  reply_received: boolean;
  reply_sentiment: 'positive' | 'neutral' | 'negative' | null;
};

export function useContactNurtures(
  contactId: string | null,
  refetchKey: number = 0,
): ContactNurture[] {
  const [rows, setRows] = useState<ContactNurture[]>([]);

  useEffect(() => {
    if (!contactId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('nurture_messages')
      .select('id,message_text,language,hook_used,trigger_type,sent_at,scheduled_for,reply_received,reply_sentiment')
      .eq('contact_id', contactId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(10)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data ?? []) as ContactNurture[]);
      });
    return () => { cancelled = true; };
  }, [contactId, refetchKey]);

  return rows;
}
