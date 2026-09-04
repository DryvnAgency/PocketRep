-- Truth-safe holiday reference copy for V1 nurture drafting.
-- Holiday timing itself is legitimate context; promotions / discounts /
-- clearance / inventory movement are NOT verified merely because a holiday
-- exists. Keep the calendar useful without seeding fabricated sales claims.

update public.holiday_calendar
set tone_guidance = case holiday_name
  when 'New Year' then 'Fresh-start relationship touch. Goal-setting or new-year timing can be referenced naturally. Do not imply a promotion.'
  when 'Valentine''s Day' then 'Light, optional relationship touch. Keep it natural; skip any cheesy sales angle.'
  when 'Memorial Day' then 'Respectful long-weekend timing. Keep the message relational; do not claim a sale or discount.'
  when 'Fourth of July' then 'Summer holiday / road-trip timing can be referenced naturally. Do not claim a special event or deal.'
  when 'Labor Day' then 'End-of-summer holiday timing only. Do not claim model-year clearance, best deals, or inventory urgency unless separately verified.'
  when 'Halloween' then 'Playful only if it fits the relationship. No invented offer or promotion.'
  when 'Thanksgiving' then 'Gratitude first. Relationship-only for past customers; no hard pitch.'
  when 'Black Friday' then 'Black Friday timing may be referenced, but do not claim a sale, discount, event, or deal unless the rep supplied verified details.'
  when 'Christmas' then 'Warm relationship-only holiday touch. No pitch.'
  else tone_guidance
end,
pitch_intensity = case holiday_name
  when 'Valentine''s Day' then 'none'
  when 'Memorial Day' then 'none'
  when 'Halloween' then 'none'
  when 'Thanksgiving' then 'none'
  when 'Christmas' then 'none'
  else 'low'
end
where holiday_name in (
  'New Year',
  'Valentine''s Day',
  'Memorial Day',
  'Fourth of July',
  'Labor Day',
  'Halloween',
  'Thanksgiving',
  'Black Friday',
  'Christmas'
);
