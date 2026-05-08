-- 0003_function_search_path.sql
-- Lock down search_path on stable functions (Supabase linter recommendation).
-- Mitigates search_path-hijack class of issues.

alter function public.current_tenant_id()                       set search_path = public, pg_temp;
alter function public.has_tenant_role(uuid, membership_role[])  set search_path = public, pg_temp;
alter function public.touch_updated_at()                        set search_path = public, pg_temp;
