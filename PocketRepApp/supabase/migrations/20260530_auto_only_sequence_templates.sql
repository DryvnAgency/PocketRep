-- Auto-first: make every GLOBAL sequence template automotive and tune the
-- content for customer retention + staying top of mind.
--
-- Global templates have user_id = null and is_template = true. sequence_steps
-- cascade-delete with their parent sequence. User-created sequences (user_id set,
-- is_custom = true) are NOT touched. contact_sequences is empty, so deleting
-- non-auto global templates orphans no enrollments.
--
-- Kept as-is (already automotive / personal): New Sold Customer, Unsold Lead
-- Re-engagement, Birthday + Anniversary. Removed: the mortgage / real-estate /
-- insurance / solar / b2b templates. Added: lease-end, trade-up equity,
-- service & maintenance, and past-customer win-back.

-- 1) Drop every non-automotive global template (steps cascade via FK).
delete from public.sequences
where is_template = true
  and user_id is null
  and industry not in ('auto', 'all');

-- 2) Upsert the automotive retention templates (fixed UUIDs => idempotent).
insert into public.sequences (id, user_id, name, description, industry, is_template, is_custom)
values
  ('00000001-0000-0000-0000-000000000009', null, 'Lease-End Upgrade',              'Start the upgrade conversation about six months before lease maturity so they stay in the family.', 'auto', true, false),
  ('00000001-0000-0000-0000-00000000000a', null, 'Trade-Up Equity Check',          'Reach owners who likely have positive equity about a payment-neutral upgrade.',                     'auto', true, false),
  ('00000001-0000-0000-0000-00000000000b', null, 'Service & Maintenance Reminder', 'Stay top of mind with service and seasonal maintenance touches that also seed the next sale.',       'auto', true, false),
  ('00000001-0000-0000-0000-00000000000c', null, 'Past-Customer Win-Back',         'Long-term touches to win back past customers when they are ready for their next vehicle.',           'auto', true, false)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      industry    = excluded.industry,
      is_template = true,
      is_custom   = false,
      user_id     = null;

-- 3) Replace steps for these templates (idempotent re-seed).
delete from public.sequence_steps
where sequence_id in (
  '00000001-0000-0000-0000-000000000009',
  '00000001-0000-0000-0000-00000000000a',
  '00000001-0000-0000-0000-00000000000b',
  '00000001-0000-0000-0000-00000000000c'
);

insert into public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize)
values
  -- Lease-End Upgrade
  ('00000001-0000-0000-0000-000000000009', 1, 0,  'text', 'hey {{first_name}}, your lease on the {{vehicle}} should be wrapping up in the next few months. want me to walk you through your options before then?', false),
  ('00000001-0000-0000-0000-000000000009', 2, 14, 'call', 'Lease-end call. Talk pull-ahead programs and current equity. Goal is a smooth upgrade so they stay in the family instead of shopping elsewhere.', false),
  ('00000001-0000-0000-0000-000000000009', 3, 30, 'text', 'hey {{first_name}}, found a couple options that could fit you nicely for your next one. want me to send a few over?', false),
  ('00000001-0000-0000-0000-000000000009', 4, 45, 'text', 'hey {{first_name}}, happy to set up a quick appraisal and lease-end review whenever works. just say the word and i will get it on the calendar.', false),
  -- Trade-Up Equity Check
  ('00000001-0000-0000-0000-00000000000a', 1, 0,  'text', 'hey {{first_name}}, the market has been wild and your {{vehicle}} may be worth more than you would guess. want me to pull your current trade equity?', false),
  ('00000001-0000-0000-0000-00000000000a', 2, 7,  'call', 'Equity call. Run a payment-neutral number: what could they get into for the same monthly. Lead with value, not urgency.', false),
  ('00000001-0000-0000-0000-00000000000a', 3, 21, 'text', 'hey {{first_name}}, a few of the newer models just landed. if you ever want to see what an upgrade looks like with your equity, i am here.', false),
  -- Service & Maintenance Reminder
  ('00000001-0000-0000-0000-00000000000b', 1, 0,  'text', 'hey {{first_name}}, looks like the {{vehicle}} may be due for service soon. want me to help you get it scheduled?', false),
  ('00000001-0000-0000-0000-00000000000b', 2, 30, 'text', 'hey {{first_name}}, seasons are changing, good time to check the tires and get everything looked over. let me know if you want me to set it up.', false),
  ('00000001-0000-0000-0000-00000000000b', 3, 90, 'text', 'hey {{first_name}}, hope the {{vehicle}} is running great. next time you are in for service i would love to say hi, and if you are curious i can show you what your trade equity looks like.', false),
  -- Past-Customer Win-Back
  ('00000001-0000-0000-0000-00000000000c', 1, 0,   'text', 'hey {{first_name}}, hope you and the family are doing great. however your year is going, just know i am still here whenever you need anything.', false),
  ('00000001-0000-0000-0000-00000000000c', 2, 60,  'text', 'hey {{first_name}}, been a minute! how is the {{vehicle}} holding up? if you are ever thinking about what is next, i would love to help.', false),
  ('00000001-0000-0000-0000-00000000000c', 3, 180, 'text', 'hey {{first_name}}, we have some great new inventory and i thought of you. if you ever want to take a look, you know where to find me.', false);
