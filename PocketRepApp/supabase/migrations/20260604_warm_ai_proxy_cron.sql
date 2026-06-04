-- 20260604_warm_ai_proxy_cron.sql
--
-- Keep the ai-proxy Edge Function warm so the first Rex call of the day isn't a
-- 30-60s cold start. The function answers GET with a 200 BEFORE auth and BEFORE
-- any LLM call (see supabase/functions/ai-proxy/index.ts), so a bare GET boots
-- the Deno isolate (and its esm.sh imports) with no JWT and no token cost.
--
-- Mechanism: pg_cron fires every 5 minutes and pg_net does an async GET. Both
-- extensions are already installed (pg_cron 1.6.4, pg_net 0.20.0).
--
-- NOTE: this migration is NOT auto-applied — apply it via MCP / `supabase db push`
-- after review. Idempotent (unschedules any prior job of the same name first).

do $$
begin
  perform cron.unschedule('warm-ai-proxy');
exception
  when others then null; -- no existing job — fine
end $$;

select cron.schedule(
  'warm-ai-proxy',
  '*/5 * * * *',
  $$ select net.http_get(url := 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy') $$
);
