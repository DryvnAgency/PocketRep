-- Drop the TWO duplicate auto-delete triggers that fire on every INSERT to
-- contacts and silently remove demo customers when the rep adds a real one.
-- User directive: "Do NOT automatically delete demos merely because the user
-- inserts the first real customer." Explicit deletion via the onboarding
-- "REMOVE SAMPLE CUSTOMERS" button remains available (RexOnboarding.tsx).

DROP TRIGGER IF EXISTS contacts_remove_demo_after_real_insert ON public.contacts;
DROP TRIGGER IF EXISTS trg_remove_demo_customers_after_real_import ON public.contacts;
DROP FUNCTION IF EXISTS public.remove_demo_contacts_after_real_insert();
DROP FUNCTION IF EXISTS public.remove_demo_customers_after_real_import();
