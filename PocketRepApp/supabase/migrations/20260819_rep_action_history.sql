-- Native SMS action history.
-- The OS does not expose whether the rep tapped Send in Messages, so
-- composer-opened and rep-confirmed-sent remain distinct states.

create table if not exists public.outbound_sms_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  message_body text not null,
  status text not null check (status in ('opened','sent','not_sent','failed','no_phone','simulated_sent')),
  source text not null default 'manual' check (source in ('manual','blast','sequence','demo')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  completed_at timestamptz
);

create index if not exists outbound_sms_actions_contact_idx
  on public.outbound_sms_actions(contact_id, created_at desc);
create index if not exists outbound_sms_actions_user_idx
  on public.outbound_sms_actions(user_id, created_at desc);

alter table public.outbound_sms_actions enable row level security;
drop policy if exists outbound_sms_actions_all_own on public.outbound_sms_actions;
create policy outbound_sms_actions_all_own on public.outbound_sms_actions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.nurture_messages add column if not exists sms_status text;
alter table public.nurture_messages add column if not exists opened_at timestamptz;
alter table public.nurture_messages add column if not exists reply_received_at timestamptz;

drop view if exists public.contact_timeline;
create view public.contact_timeline
with (security_invoker = true)
as
select i.id, i.contact_id, i.type as event_type, i.notes, i.outcome,
       i.interaction_date as event_date, 'interaction'::text as source
from public.interactions i
union all
select n.id, n.contact_id, coalesce(n.kind, n.trigger_type, 'nurture') as event_type,
       n.message_text as notes, n.sms_status as outcome,
       coalesce(n.sent_at, n.opened_at, n.created_at) as event_date,
       'nurture'::text as source
from public.nurture_messages n
where n.sent_at is not null or n.opened_at is not null
union all
select md5(n.id::text || ':reply')::uuid, n.contact_id, 'reply'::text,
       n.reply_text, n.reply_sentiment,
       coalesce(n.reply_received_at, n.created_at), 'reply'::text
from public.nurture_messages n
where n.reply_received = true and n.reply_text is not null
union all
select o.id, o.contact_id, 'text'::text, o.message_body, o.status,
       o.created_at, 'sms_action'::text
from public.outbound_sms_actions o;

grant select on public.contact_timeline to authenticated;
