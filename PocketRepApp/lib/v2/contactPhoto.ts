// Contact photo upload: pick an image from the device library (or camera on
// native) and stash it in the contact-photos Supabase bucket. The bucket is
// private and tenant-isolated (see 20260828_contact_photos_private.sql), so a
// long-lived SIGNED url — not the old public-bucket URL — goes back into
// contacts.photo_url. Minting the signed URL itself enforces the read RLS
// policy (owner-only), so a rep can never sign a path outside their own
// user_id prefix.
//
// Storage path layout: <user_id>/<contact_id>-<timestamp>.<ext>
// RLS keys reads/writes to the rep's own user_id prefix (see migration).

// ~1 year — long enough to behave like a stable link for a thumbnail that's
// rarely re-uploaded, without the app needing a background URL-refresh job.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

function loadImagePicker(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-image-picker');
  } catch {
    return null;
  }
}

export type PhotoPickResult =
  | { ok: true; publicUrl: string }
  | { ok: false; reason: string };

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

function extFromUri(uri: string, mime?: string): string {
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('webp')) return 'webp';
  if (mime?.includes('gif')) return 'gif';
  // Fall back on the extension in the URI, default to jpg.
  const m = uri.match(/\.([a-zA-Z0-9]{2,5})(\?|$)/);
  return (m?.[1] ?? 'jpg').toLowerCase();
}

export async function pickAndUploadContactPhoto(contactId: string): Promise<PhotoPickResult> {
  const ImagePicker = loadImagePicker();
  if (!ImagePicker) return { ok: false, reason: 'image picker unavailable' };

  // Permission
  try {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return { ok: false, reason: 'permission denied' };
    }
  } catch {
    /* web doesn't need explicit permission */
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'Images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    base64: false,
  });
  if (result?.canceled) return { ok: false, reason: 'cancelled' };

  const asset = result?.assets?.[0];
  if (!asset?.uri) return { ok: false, reason: 'no image picked' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not signed in' };

  const blob = await uriToBlob(asset.uri);
  const ext = extFromUri(asset.uri, asset.mimeType);
  const path = `${user.id}/${contactId}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase
    .storage
    .from('contact-photos')
    .upload(path, blob, { upsert: true, contentType: asset.mimeType ?? `image/${ext}` });
  if (upErr) return { ok: false, reason: upErr.message };

  const { data: signed, error: signErr } = await supabase
    .storage
    .from('contact-photos')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) return { ok: false, reason: signErr?.message ?? 'could not sign url' };

  const { error: updateErr } = await supabase
    .from('contacts')
    .update({ photo_url: signed.signedUrl, updated_at: new Date().toISOString() })
    .eq('id', contactId);
  if (updateErr) return { ok: false, reason: updateErr.message };

  return { ok: true, publicUrl: signed.signedUrl };
}
