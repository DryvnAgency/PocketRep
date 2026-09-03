// Internal support chat data layer. Reps create tickets and send messages;
// admin (profiles.role='admin') sees all tickets and responds. Pushover
// notification fires on rep messages via the support-notify edge function.

import { supabase } from '@/lib/supabase';

const FUNCTIONS_BASE = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1';
const SUPPORT_BUCKET = 'support-attachments';
const MAX_SUPPORT_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORT_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// ── Types ────────────────────────────────────────────────────────────────────

export type SupportTicket = {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'resolved';
  created_at: string;
  updated_at: string;
  // Joined fields (admin view only)
  rep_name?: string;
  rep_email?: string;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_role: 'rep' | 'admin' | 'system';
  content: string;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  created_at: string;
};

export type SupportImageUpload = {
  ticketId: string;
  senderRole: 'rep' | 'admin';
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  /** Required for admin sends; rep sends derive the owner from auth. */
  ownerUserId?: string | null;
  caption?: string;
};

// ── Rep functions ────────────────────────────────────────────────────────────

/** Load the current rep's support tickets, newest activity first. */
export async function loadMyTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

/** Create a new support ticket with an initial message. */
export async function createTicket(subject: string, firstMessage: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { data: ticket, error: ticketErr } = await supabase
    .from('support_tickets')
    .insert({ user_id: user.id, subject })
    .select('id')
    .single();
  if (ticketErr) throw ticketErr;
  const ticketId = (ticket as { id: string }).id;

  const { error: msgErr } = await supabase
    .from('support_messages')
    .insert({ ticket_id: ticketId, sender_role: 'rep', content: firstMessage });
  if (msgErr) throw msgErr;

  // The edge function derives the rep and message from stored, tenant-checked
  // rows; none of the notification display data is trusted from the client.
  notifyAdmin(ticketId).catch(() => undefined);

  return ticketId;
}

/** Load all messages for a ticket, oldest first. */
export async function loadMessages(ticketId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
}

/** Send a text message in an existing ticket. */
export async function sendMessage(
  ticketId: string,
  content: string,
  senderRole: 'rep' | 'admin',
): Promise<void> {
  const { error } = await supabase
    .from('support_messages')
    .insert({ ticket_id: ticketId, sender_role: senderRole, content });
  if (error) throw error;

  if (senderRole === 'rep') {
    notifyAdmin(ticketId).catch(() => undefined);
  }
}

function safeMime(value?: string | null): string {
  const mime = String(value || 'image/jpeg').toLowerCase();
  if (!SUPPORT_IMAGE_MIMES.has(mime)) throw new Error('Only JPG, PNG, WEBP, HEIC, or HEIF images are supported.');
  return mime;
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'jpg';
}

function randomFileStem(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Upload an image to the ticket-private bucket and persist it as a support message. */
export async function sendImageMessage(input: SupportImageUpload): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const ownerUserId = input.senderRole === 'rep' ? user.id : String(input.ownerUserId || '');
  if (!ownerUserId) throw new Error('ticket owner is required');

  const mime = safeMime(input.mimeType);
  if (input.fileSize && input.fileSize > MAX_SUPPORT_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller.');
  }

  const source = await fetch(input.uri);
  if (!source.ok) throw new Error('Could not read the selected image.');
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength > MAX_SUPPORT_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller.');

  const ext = extensionForMime(mime);
  const path = `${ownerUserId}/${input.ticketId}/${randomFileStem()}.${ext}`;
  const cleanName = String(input.fileName || `support-image.${ext}`).slice(0, 180);

  const { error: uploadError } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;

  const caption = String(input.caption || '').trim().slice(0, 2000);
  const { error: messageError } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: input.ticketId,
      sender_role: input.senderRole,
      content: caption || '[Image attachment]',
      attachment_path: path,
      attachment_mime: mime,
      attachment_name: cleanName,
      attachment_size: bytes.byteLength,
    });

  if (messageError) {
    // Avoid orphaning a private upload when the message insert fails.
    await supabase.storage.from(SUPPORT_BUCKET).remove([path]).catch(() => undefined);
    throw messageError;
  }

  if (input.senderRole === 'rep') {
    notifyAdmin(input.ticketId).catch(() => undefined);
  }
}

/** Generate a short-lived URL after RLS proves the caller can read the object. */
export async function getSupportAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path, 15 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not open attachment.');
  return data.signedUrl;
}

/** Reopen a resolved ticket. */
export async function reopenTicket(ticketId: string): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: 'open' })
    .eq('id', ticketId);
  if (error) throw error;
}

// ── Admin functions ──────────────────────────────────────────────────────────

/** Load ALL support tickets (admin only — RLS gates this). */
export async function loadAllTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, profiles!support_tickets_user_id_fkey(full_name, email)')
    .order('updated_at', { ascending: false });
  if (error) {
    const { data: plain, error: plainErr } = await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });
    if (plainErr) throw plainErr;
    return (plain ?? []) as SupportTicket[];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    subject: row.subject,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rep_name: row.profiles?.full_name ?? null,
    rep_email: row.profiles?.email ?? null,
  })) as SupportTicket[];
}

/** Resolve a support ticket (admin action). */
export async function resolveTicket(ticketId: string): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: 'resolved' })
    .eq('id', ticketId);
  if (error) throw error;
}

/** Check if the current user has the admin role. */
export async function checkIsAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return (data as any)?.role === 'admin';
}

/** Count open tickets (admin). */
export async function countOpenTickets(): Promise<number> {
  const { count, error } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) return 0;
  return count ?? 0;
}

// ── Pushover notification ────────────────────────────────────────────────────

async function notifyAdmin(ticketId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  await fetch(`${FUNCTIONS_BASE}/support-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ticket_id: ticketId }),
  });
}
