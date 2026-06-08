-- 20260608_v2_waitlist_trigger.sql
--
-- Email the owner on each new public.waitlist signup. A pg_net async POST hands
-- the new row to the `waitlist-notify` Edge Function, which sends the email via
-- Resend (reading RESEND_API_KEY / WAITLIST_NOTIFY_TO / WAITLIST_NOTIFY_FROM from
-- Edge Function secrets; until those are set it logs and skips the email).
--
-- The token below is the PUBLIC publishable/anon key (role=anon), safe to commit.
-- The trigger never blocks the insert (pg_net is async + the body is exception-guarded).
-- pg_net + pg_cron are already installed on this project.
--
-- Applied via MCP. Idempotent.

create or replace function public.notify_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/waitlist-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dnJhdXFkb2V2d213d3FsZmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzczOTAsImV4cCI6MjA4OTk1MzM5MH0.D0Mu7wWB59NUr7cFtkl_00ijbseSz_SsV86pwJSn0s0'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'waitlist',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
exception when others then
  raise warning 'notify_waitlist_signup failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_waitlist_notify on public.waitlist;
create trigger trg_waitlist_notify
  after insert on public.waitlist
  for each row execute function public.notify_waitlist_signup();
