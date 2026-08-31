-- The contact-photos bucket was created fully public (bucket public:true) with
-- a SELECT policy carrying no role restriction and no owner/path check
-- (`USING (bucket_id = 'contact-photos')`). Any authenticated OR unauthenticated
-- caller could read AND enumerate every rep's customer photos by guessing/
-- listing <user_id>/<contact_id>-<timestamp>.<ext> paths. Real cross-tenant PII
-- exposure (photos of dealership customers), flagged in
-- docs/SECURITY_RLS_AUDIT.md on 2026-06-01, unresolved for ~3 months.
--
-- Fix: make the bucket private and scope SELECT to the owning rep's own
-- user_id path prefix, matching the write/update/delete policies below (which
-- were already correctly scoped). Zero rows in contacts.photo_url are set as
-- of this migration (verified live), so there is no existing-URL backfill to
-- perform — no rep currently has a stored public URL that this breaks.
--
-- The client (lib/v2/contactPhoto.ts) is updated in the same change to store
-- a long-lived SIGNED url (via createSignedUrl, not getPublicUrl) in
-- contacts.photo_url going forward — a private bucket's public object route
-- (/object/public/...) 403s regardless of RLS, so the public-URL flow can no
-- longer work once public:false takes effect. Signed URLs still enforce this
-- SELECT policy when minted (createSignedUrl requires read authorization on
-- the object), so tenant isolation is enforced at generation time, not just
-- at fetch time.

UPDATE storage.buckets SET public = false WHERE id = 'contact-photos';

DROP POLICY IF EXISTS "contact_photos_read" ON storage.objects;
CREATE POLICY "contact_photos_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contact-photos'
    AND (split_part(name, '/', 1) = auth.uid()::text)
  );
