-- Public Supabase Storage bucket for contact avatars. Object paths:
--   <user_id>/<contact_id>-<timestamp>.<ext>
-- Public read so the rendered <Image src=publicUrl> works without auth.
-- Write/update/delete locked to the rep's own user_id prefix via RLS.

INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-photos', 'contact-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "contact_photos_read" ON storage.objects;
CREATE POLICY "contact_photos_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'contact-photos');

DROP POLICY IF EXISTS "contact_photos_write_own" ON storage.objects;
CREATE POLICY "contact_photos_write_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contact-photos'
    AND (split_part(name, '/', 1) = auth.uid()::text)
  );

DROP POLICY IF EXISTS "contact_photos_update_own" ON storage.objects;
CREATE POLICY "contact_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contact-photos'
    AND (split_part(name, '/', 1) = auth.uid()::text)
  );

DROP POLICY IF EXISTS "contact_photos_delete_own" ON storage.objects;
CREATE POLICY "contact_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contact-photos'
    AND (split_part(name, '/', 1) = auth.uid()::text)
  );
