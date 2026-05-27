import { supabase } from '@/lib/supabase';
import { applyTagToContacts } from './tagMutations';
import type { V2Contact } from './useContacts';

export type BatchActionKind =
  | 'add_tag'
  | 'mark_dead'
  | 'mark_active'
  | 'archive';

export async function executeBatchAction(
  kind: BatchActionKind,
  contactIds: string[],
  payload: Record<string, any>,
  allContacts: V2Contact[],
): Promise<{ updated: number }> {
  if (contactIds.length === 0) return { updated: 0 };
  const now = new Date().toISOString();

  switch (kind) {
    case 'add_tag': {
      const tag = String(payload?.tag ?? '').trim();
      if (!tag) return { updated: 0 };
      const next = await applyTagToContacts(allContacts, tag, contactIds);
      // applyTagToContacts returns the updated array; we just need the count
      // of rows it touched.
      return { updated: contactIds.length };
      void next;
    }
    case 'mark_dead': {
      const { error } = await supabase
        .from('contacts')
        .update({ rep_decision: 'dead', updated_at: now })
        .in('id', contactIds);
      if (error) throw error;
      return { updated: contactIds.length };
    }
    case 'mark_active': {
      const { error } = await supabase
        .from('contacts')
        .update({ rep_decision: 'active', updated_at: now })
        .in('id', contactIds);
      if (error) throw error;
      return { updated: contactIds.length };
    }
    case 'archive': {
      // "Archive" in the spec means "stop active selling, start nurture" —
      // soft delete + rep_decision='dead' so the nurture engine picks them up.
      const { error } = await supabase
        .from('contacts')
        .update({ is_deleted: true, rep_decision: 'dead', updated_at: now })
        .in('id', contactIds);
      if (error) throw error;
      return { updated: contactIds.length };
    }
  }
}
