// Unified notifications inbox. There is no notifications table — we aggregate
// live "things that need the rep's attention" from existing data:
//   1. pending nurture drafts (need review/send)
//   2. sent nurtures awaiting a reply mark
//   3. overdue hot/warm contacts (going cold)
// Read/dismissed state is tracked per-device in notificationReads.ts.

import { useEffect, useReducer, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadPendingNurtures } from './nurtureEngine';
import { loadDueReminders, rollOverDueReminders } from './reminders';
import {
  getReadSet,
  getDismissedSet,
  subscribeNotifReads,
} from './notificationReads';
import type { V2Contact } from './useContacts';

export type NotificationKind = 'nurture_draft' | 'awaiting_reply' | 'overdue' | 'reminder';
export type NotificationTarget = 'contact' | 'nurture';

export type NotificationItem = {
  key: string;
  kind: NotificationKind;
  title: string;
  subtitle: string; // what the rep needs to do
  contactId: string | null;
  target: NotificationTarget;
  reminderId?: string; // set for kind 'reminder' so the panel can mark it done
};

export async function loadNotifications(contacts: V2Contact[]): Promise<NotificationItem[]> {
  const items: NotificationItem[] = [];

  // 0) Rex reminders — most time-sensitive, so first. Roll any left un-done past
  // their day forward before reading (carry-over), then surface today's/overdue.
  try {
    await rollOverDueReminders();
    const reminders = await loadDueReminders();
    const now = Date.now();
    for (const r of reminders) {
      const due = new Date(r.due_at);
      const valid = !Number.isNaN(due.getTime());
      const time = valid ? due.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
      const overdue = valid && due.getTime() <= now;
      items.push({
        key: `reminder:${r.id}`,
        reminderId: r.id,
        kind: 'reminder',
        title: r.title,
        subtitle: overdue ? `Due now${time ? ` · was ${time}` : ''}` : `Reminder${time ? ` · ${time}` : ''}`,
        contactId: r.contact_id,
        target: 'contact',
      });
    }
  } catch (e) {
    console.warn('notifications: reminders failed', e);
  }

  // 1) Pending nurture drafts (review + send)
  try {
    const pending = await loadPendingNurtures();
    for (const p of pending) {
      items.push({
        key: `nurture:${p.id}`,
        kind: 'nurture_draft',
        title: `Draft ready for ${p.contact_name}`,
        subtitle: `Review and send the ${p.trigger_type.replace(/_/g, ' ')} message`,
        contactId: p.contact_id,
        target: 'nurture',
      });
    }
  } catch (e) {
    console.warn('notifications: pending nurtures failed', e);
  }

  // 2) Sent nurtures awaiting a reply mark (last 14 days)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const { data } = await supabase
        .from('nurture_messages')
        .select('id,contact_id,sent_at,contacts!inner(first_name,last_name)')
        .eq('user_id', user.id)
        .not('sent_at', 'is', null)
        .eq('reply_received', false)
        .gte('sent_at', since)
        .order('sent_at', { ascending: false });
      for (const r of (data ?? []) as any[]) {
        const name = `${r.contacts?.first_name ?? ''} ${r.contacts?.last_name ?? ''}`.trim() || 'a contact';
        items.push({
          key: `reply:${r.id}`,
          kind: 'awaiting_reply',
          title: `Did ${name} reply?`,
          subtitle: 'Mark the reply so Rex can route the follow-up',
          contactId: r.contact_id,
          target: 'contact',
        });
      }
    }
  } catch (e) {
    console.warn('notifications: awaiting replies failed', e);
  }

  // 3) Overdue hot/warm contacts (going cold) — most overdue first
  const overdue = contacts
    .filter(c => !c.doNotContact && (c.tier === 'hot' || c.tier === 'warm') && c.days >= 4)
    .sort((a, b) => b.days - a.days);
  for (const c of overdue) {
    items.push({
      key: `overdue:${c.id}`,
      kind: 'overdue',
      title: `Follow up with ${c.name}`,
      subtitle: `${c.days} days since last contact · ${c.tier.toUpperCase()}`,
      contactId: c.id,
      target: 'contact',
    });
  }

  return items;
}

export type ResolvedNotification = NotificationItem & { read: boolean };

// Loads notifications, filters out dismissed ones, annotates read state, and
// re-renders whenever read/dismissed state changes. `refetchKey` forces a reload
// after the rep acts on something (e.g. sends a nurture).
export function useNotifications(
  contacts: V2Contact[] | null,
  refetchKey: number = 0,
): { items: ResolvedNotification[]; unread: number } {
  const [raw, setRaw] = useState<NotificationItem[]>([]);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let cancelled = false;
    loadNotifications(contacts ?? []).then(r => { if (!cancelled) setRaw(r); });
    return () => { cancelled = true; };
  }, [contacts, refetchKey]);

  useEffect(() => subscribeNotifReads(bump), []);

  const dismissed = getDismissedSet();
  const read = getReadSet();
  const items = raw
    .filter(i => !dismissed.has(i.key))
    .map(i => ({ ...i, read: read.has(i.key) }));
  const unread = items.reduce((n, i) => n + (i.read ? 0 : 1), 0);

  return { items, unread };
}
