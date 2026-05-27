// Contact photo upload: pick an image from the device library (or camera on
// native) and stash it in the contact-photos Supabase bucket. The public URL
// goes back into contacts.photo_url.
//
// Storage path layout: <user_id>/<contact_id>-<timestamp>.<ext>
// RLS keys writes to the rep's own user_id prefix (see migration).

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

  const { data: pub } = supabase.storage.from('contact-photos').getPublicUrl(path);
  const publicUrl = pub?.publicUrl ?? '';
  if (!publicUrl) return { ok: false, reason: 'no public url' };

  const { error: updateErr } = await supabase
    .from('contacts')
    .update({ photo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', contactId);
  if (updateErr) return { ok: false, reason: updateErr.message };

  return { ok: true, publicUrl };
}
