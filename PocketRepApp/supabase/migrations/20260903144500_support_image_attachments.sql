-- Private image attachments for PocketRep support chat.
-- Reps may access only their own ticket paths; admins may access legitimate
-- ticket paths across the support inbox. Objects are never public.

alter table public.support_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_support_admin() from public, anon;
grant execute on function public.is_support_admin() to authenticated;

-- A valid object name is <ticket-owner-uuid>/<ticket-uuid>/<random-file>.
-- Both folder ids must agree with the persisted support ticket. This prevents
-- a rep from inventing another user's path or ticket id.
drop policy if exists support_attachments_select on storage.objects;
create policy support_attachments_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'support-attachments'
  and exists (
    select 1
    from public.support_tickets t
    where t.user_id::text = (storage.foldername(name))[1]
      and t.id::text = (storage.foldername(name))[2]
      and (t.user_id = auth.uid() or public.is_support_admin())
  )
);

drop policy if exists support_attachments_insert on storage.objects;
create policy support_attachments_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'support-attachments'
  and exists (
    select 1
    from public.support_tickets t
    where t.user_id::text = (storage.foldername(name))[1]
      and t.id::text = (storage.foldername(name))[2]
      and (t.user_id = auth.uid() or public.is_support_admin())
  )
);

drop policy if exists support_attachments_delete on storage.objects;
create policy support_attachments_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'support-attachments'
  and exists (
    select 1
    from public.support_tickets t
    where t.user_id::text = (storage.foldername(name))[1]
      and t.id::text = (storage.foldername(name))[2]
      and (t.user_id = auth.uid() or public.is_support_admin())
  )
);
