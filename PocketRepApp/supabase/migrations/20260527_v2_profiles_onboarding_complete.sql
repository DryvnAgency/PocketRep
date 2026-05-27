-- Move onboarding completion off localStorage and into the per-user profile
-- so a fresh browser / new device doesn't replay the playbook for someone
-- who already finished it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

-- Backfill from public.users (the legacy table that already tracks the flag)
UPDATE public.profiles p
SET onboarding_complete = true
FROM public.users u
WHERE u.id = p.id
  AND u.onboarding_complete = true
  AND p.onboarding_complete = false;
