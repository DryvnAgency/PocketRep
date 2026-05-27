-- Rex Intelligence schema (PRs #36-#39 foundation).
-- last_contact_date already exists as `date` — keep it; days-since math is fine.
-- purchase_date already exists as `date` — no change.

-- ===== CONTACTS extensions =====
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_contact_method text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_contact_summary text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS rep_decision text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS do_not_contact boolean DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lease_end_date date;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS current_mileage int;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS vehicle_year int;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS vehicle_make text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_past_customer boolean DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE table_name='contacts' AND constraint_name='contacts_last_contact_method_check') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT contacts_last_contact_method_check
      CHECK (last_contact_method IS NULL OR last_contact_method IN ('call','text','in_person','email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE table_name='contacts' AND constraint_name='contacts_rep_decision_check') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT contacts_rep_decision_check
      CHECK (rep_decision IS NULL OR rep_decision IN ('kill','push','fence','watch','active','dead','do_not_nurture'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE table_name='contacts' AND constraint_name='contacts_preferred_language_check') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT contacts_preferred_language_check
      CHECK (preferred_language IN ('en','es'));
  END IF;
END $$;

-- ===== CONTACT MILESTONES =====
CREATE TABLE IF NOT EXISTS public.contact_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id),
  milestone_type text NOT NULL CHECK (milestone_type IN (
    'lease_end','mileage_threshold','purchase_anniversary',
    'budget_ready','birthday','custom'
  )),
  milestone_date date NOT NULL,
  urgency_score int CHECK (urgency_score BETWEEN 0 AND 100),
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_contact ON public.contact_milestones(contact_id);
CREATE INDEX IF NOT EXISTS idx_milestones_user_date ON public.contact_milestones(user_id, milestone_date);
ALTER TABLE public.contact_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own milestones" ON public.contact_milestones;
CREATE POLICY "Users see own milestones" ON public.contact_milestones
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== NURTURE MESSAGES =====
CREATE TABLE IF NOT EXISTS public.nurture_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id),
  message_text text NOT NULL,
  language text DEFAULT 'en' CHECK (language IN ('en','es')),
  hook_used text CHECK (hook_used IS NULL OR hook_used IN (
    'personal_detail','vehicle_interest','calendar_event',
    'past_purchase','holiday','pricing','inventory','rapport'
  )),
  trigger_type text NOT NULL,
  pitch_intensity text CHECK (pitch_intensity IS NULL OR pitch_intensity IN ('none','low','medium','high')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  reply_received boolean DEFAULT false,
  reply_text text,
  reply_sentiment text CHECK (reply_sentiment IS NULL OR reply_sentiment IN ('positive','neutral','negative')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nurture_contact ON public.nurture_messages(contact_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nurture_user_scheduled ON public.nurture_messages(user_id, scheduled_for);
ALTER TABLE public.nurture_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own nurture history" ON public.nurture_messages;
CREATE POLICY "Users see own nurture history" ON public.nurture_messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== SEQUENCES + SEQUENCE_STEPS extensions =====
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS source_intent text;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS is_ai_drafted boolean DEFAULT false;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS draft_status text;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE table_name='sequences' AND constraint_name='sequences_draft_status_check') THEN
    ALTER TABLE public.sequences ADD CONSTRAINT sequences_draft_status_check
      CHECK (draft_status IS NULL OR draft_status IN ('pending_review','approved','sending','sent','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE table_name='sequences' AND constraint_name='sequences_language_check') THEN
    ALTER TABLE public.sequences ADD CONSTRAINT sequences_language_check
      CHECK (language IN ('en','es','mixed'));
  END IF;
END $$;

ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id);
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS personalization jsonb;
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS game_plan text;
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS hook_used text;
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS rep_edited boolean DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE table_name='sequence_steps' AND constraint_name='sequence_steps_language_check') THEN
    ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_language_check
      CHECK (language IN ('en','es'));
  END IF;
END $$;

-- ===== HOLIDAY CALENDAR =====
CREATE TABLE IF NOT EXISTS public.holiday_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_name text NOT NULL,
  holiday_date date NOT NULL,
  tone_guidance text,
  pitch_intensity text CHECK (pitch_intensity IS NULL OR pitch_intensity IN ('none','low','medium','high')),
  applies_to_dead_leads boolean DEFAULT true,
  applies_to_past_customers boolean DEFAULT true,
  applies_to_active_leads boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (holiday_name, holiday_date)
);

INSERT INTO public.holiday_calendar (holiday_name, holiday_date, tone_guidance, pitch_intensity) VALUES
  ('New Year',         '2026-01-01', 'Fresh start vibe. Goal-setting. New ride for new year angle.', 'low'),
  ('Valentine''s Day', '2026-02-14', 'Light and fun. Treat yourself angle. Skip if uncomfortable.', 'none'),
  ('Memorial Day',     '2026-05-25', 'Patriotic, casual long weekend. Best sale of spring.', 'medium'),
  ('Fourth of July',   '2026-07-04', 'Summer roadtrip angle. Big sale event.', 'medium'),
  ('Labor Day',        '2026-09-07', 'End of summer. Model year clearance. Best deals.', 'high'),
  ('Halloween',        '2026-10-31', 'Playful. No tricks just treats.', 'low'),
  ('Thanksgiving',     '2026-11-26', 'Gratitude. Past customers especially. No hard pitch.', 'none'),
  ('Black Friday',     '2026-11-27', 'Hardest sell of the year. Deals first.', 'high'),
  ('Christmas',        '2026-12-25', 'Warmest tone. No pitch. Relationship only.', 'none')
ON CONFLICT (holiday_name, holiday_date) DO NOTHING;

-- ===== REX ACTION LOG =====
CREATE TABLE IF NOT EXISTS public.rex_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  action_type text NOT NULL,
  action_payload jsonb,
  contact_ids uuid[],
  confirmed_at timestamptz,
  executed_at timestamptz,
  result text CHECK (result IS NULL OR result IN ('success','cancelled','partial','failed')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rex_log_user ON public.rex_action_log(user_id, created_at DESC);
ALTER TABLE public.rex_action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own action log" ON public.rex_action_log;
CREATE POLICY "Users see own action log" ON public.rex_action_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== USER PUSH TOKENS (Expo Push) =====
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  expo_token text NOT NULL,
  platform text CHECK (platform IN ('ios','android','web')),
  device_name text,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, expo_token)
);
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users manage own push tokens" ON public.user_push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
