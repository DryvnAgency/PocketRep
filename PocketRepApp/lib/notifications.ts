/**
 * PocketRep — Local Push Notification Scheduling
 *
 * Schedules reminders tied to:
 *   - follow_up_date (from voice intake)
 *   - lease_end_date milestones (6mo / 3mo / 1mo before)
 *   - personal_events (baby due, anniversary, etc.)
 *
 * Uses expo-notifications (already installed + configured in app.json).
 * Safe to call from web — all methods no-op gracefully on web platform.
 */

import { Platform } from 'react-native';
import type { PersonalEvent } from '@/lib/types';
export type { PersonalEvent };

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {}

// ── Parse a YYYY-MM-DD string as LOCAL date (avoids UTC midnight timezone trap)
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

// ── Setup handler (call once at app root) ────────────────────────────────────
export function setupNotificationHandler() {
  if (!Notifications || Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// ── Request permission + Android channel ─────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications || Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync?.('pocketrep', {
      name: 'PocketRep',
      importance: 4, // HIGH
      sound: 'default',
    }).catch(() => {});
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Schedule a single notification ───────────────────────────────────────────
async function schedule(title: string, body: string, date: Date): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  if (date <= new Date()) return; // skip past dates
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { date },
    });
  } catch (e) {
    console.warn('PocketRep notification schedule error:', e);
  }
}

// ── Cancel all notifications for a contact ───────────────────────────────────
// (Call before rescheduling to avoid duplicates)
export async function cancelContactNotifications(contactId: string): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content?.data?.contact_id === contactId) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {}
}

// ── Main entry point — schedule all reminders for a contact ──────────────────
export async function scheduleContactReminders(opts: {
  contactId: string;
  contactName: string;
  followUpDate: string | null;
  leaseEndDate: string | null;
  personalEvents: PersonalEvent[];
}): Promise<number> {
  if (!Notifications || Platform.OS === 'web') return 0;

  const { contactId, contactName, followUpDate, leaseEndDate, personalEvents } = opts;
  let count = 0;

  // 1. Follow-up date reminder
  if (followUpDate) {
    const d = parseLocalDate(followUpDate);
    d.setHours(9, 0, 0, 0);
    await schedule(
      `📞 Follow up with ${contactName}`,
      `Rex says: "This is the day you said you'd reach out. Don't let them go cold."`,
      d
    );
    count++;
  }

  // 2. Lease end date milestones
  if (leaseEndDate) {
    const leaseDate = parseLocalDate(leaseEndDate);

    const milestones = [
      { daysBeforeMs: 180 * 86400000, label: '6 months', tag: '⏰' },
      { daysBeforeMs: 90 * 86400000,  label: '3 months', tag: '🔥' },
      { daysBeforeMs: 30 * 86400000,  label: '1 month',  tag: '🚨' },
    ];

    for (const m of milestones) {
      const d = new Date(leaseDate.getTime() - m.daysBeforeMs);
      d.setHours(9, 0, 0, 0);
      await schedule(
        `${m.tag} ${contactName}'s lease is up in ${m.label}`,
        `Time to reach out before the bank does. Rex has your script.`,
        d
      );
      count++;
    }
  }

  // 3. Personal events
  for (const ev of personalEvents) {
    if (!ev.date) continue;
    const d = parseLocalDate(ev.date);
    d.setHours(9, 0, 0, 0);

    const labels: Record<string, { title: string; body: string }> = {
      baby_due: {
        title: `🍼 ${contactName}'s baby is due around now`,
        body: `Check in — congratulate them, and this is the perfect time to talk bigger vehicle.`,
      },
      anniversary: {
        title: `🎉 ${contactName}'s anniversary`,
        body: `A quick personal touch goes a long way. Rex tip: keep it short and warm.`,
      },
      birthday: {
        title: `🎂 ${contactName}'s birthday`,
        body: `Happy birthday message = top of mind. No pitch needed today.`,
      },
    };

    const notif = labels[ev.type] ?? {
      title: `📌 ${contactName} — personal milestone`,
      body: `You noted: ${ev.type}. A good time to reach out.`,
    };

    await schedule(notif.title, notif.body, d);
    count++;
  }

  return count;
}

// ── Weekly Sunday digest notification ────────────────────────────────────────
export async function scheduleWeeklyDigest(hour: number, minute: number): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  // Cancel any existing weekly digest
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content?.data?.type === 'weekly_digest') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Your Weekly Digest is Ready',
      body: "Rex reviewed your week — tap to see your game plan and who to contact.",
      data: { type: 'weekly_digest' },
      sound: true,
    },
    trigger: {
      weekday: 1, // 1 = Sunday in expo-notifications
      hour,
      minute,
      repeats: true,
    },
  });
}

export async function cancelWeeklyDigest(): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content?.data?.type === 'weekly_digest') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {}
}

// ── Schedule daily sequence reminders (one per day, 9am) ─────────────────────
// Call after creating a Rex-generated sequence so the rep gets a morning nudge
// for each step.
export async function scheduleSequenceDailyReminders(opts: {
  contactId: string;
  contactFirstName: string;
  contactPhone: string | null;
  sequenceSteps: Array<{ delay_days: number }>;
  sequenceCreatedAt?: string; // ISO string — defaults to now
}): Promise<number> {
  if (!Notifications || Platform.OS === 'web') return 0;

  const { contactId, contactFirstName, contactPhone, sequenceSteps, sequenceCreatedAt } = opts;
  const base = sequenceCreatedAt ? new Date(sequenceCreatedAt) : new Date();
  // Normalise base to start of day
  base.setHours(0, 0, 0, 0);

  let count = 0;
  for (const step of sequenceSteps) {
    const fire = new Date(base.getTime() + step.delay_days * 86400000);
    fire.setHours(9, 0, 0, 0);
    await schedule(
      `📞 Day ${step.delay_days}: Reach out to ${contactFirstName}`,
      contactPhone ? `Open Messages to ${contactFirstName} — ${contactPhone}` : `Time to follow up with ${contactFirstName}`,
      fire,
    );
    count++;
  }
  return count;
}
