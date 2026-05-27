-- Backfills + demo data for the Rex Intelligence build.

UPDATE public.contacts
SET rep_decision = 'active'
WHERE rep_decision IS NULL AND is_deleted = false;

INSERT INTO public.contact_milestones (contact_id, user_id, milestone_type, milestone_date, urgency_score, notes)
SELECT
  c.id, c.user_id, 'lease_end',
  CURRENT_DATE + INTERVAL '60 days',
  85, 'Lease ending soon, prime for refresh'
FROM public.contacts c
WHERE c.user_id = 'd0000000-0000-0000-0000-000000000001'
  AND c.heat_score >= 60
  AND c.vehicle IS NOT NULL
LIMIT 3;

UPDATE public.contacts
SET preferred_language = 'es'
WHERE user_id = 'd0000000-0000-0000-0000-000000000001'
  AND first_name = 'Sofia';
