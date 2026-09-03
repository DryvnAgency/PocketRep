-- Reconcile production drift: source has always intended demo customers to
-- disappear when a rep adds/imports the first real customer, but the trigger is
-- absent in production. Keep the demo learning experience isolated from a real book.

create or replace function public.remove_demo_customers_after_real_import()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(new.is_demo, false) = false then
    delete from public.contacts
    where user_id = new.user_id
      and is_demo = true;
  end if;
  return new;
end;
$function$;

revoke all on function public.remove_demo_customers_after_real_import() from public;
revoke all on function public.remove_demo_customers_after_real_import() from anon;
revoke all on function public.remove_demo_customers_after_real_import() from authenticated;

drop trigger if exists trg_remove_demo_customers_after_real_import on public.contacts;
create trigger trg_remove_demo_customers_after_real_import
after insert on public.contacts
for each row
execute function public.remove_demo_customers_after_real_import();
