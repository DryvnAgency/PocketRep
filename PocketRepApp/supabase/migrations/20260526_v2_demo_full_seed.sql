-- Seed the remaining 9 mock contacts for the demo user so the v2 Heat Sheet
-- renders the full HOT/WARM/WATCH layout from design/PocketRep-Standalone.html.
-- Heat score buckets used client-side (lib/v2/useContacts.ts):
--   >= 80 hot · 50-79 warm · < 50 watch
-- last_contact_date is back-dated relative to CURRENT_DATE to match the
-- "days since" counter in the mock.

DO $$
DECLARE demo_uid uuid := 'd0000000-0000-0000-0000-000000000001';
DECLARE today date := CURRENT_DATE;
BEGIN
  UPDATE public.contacts
     SET last_contact_date = today - 1,
         heat_score = 90,
         tags = ARRAY['M Series','Repeat']
   WHERE user_id = demo_uid AND first_name = 'Marcus';

  INSERT INTO public.contacts (
    user_id, first_name, last_name, phone, vehicle, trim, budget, trade_in,
    plan_label, heat_score, last_contact_date, tags, notes, next_step,
    milestones, stage
  ) VALUES
  (demo_uid, 'Priya', 'Raman', '(646) 555-0112', '''26 X5 xDrive40i', 'Alpine White · Premium', '74K', 'None',
    'THIS WEEK', 85, today - 2, ARRAY['SUV','Lease'],
    'Coming off a Q7 lease. Wants the captain''s chairs in the 2nd row — confirm package availability. 36mo lease, money factor sensitive. Decision-maker: her, no spouse involved.',
    'Confirm the Premium Package allocation in Alpine White with captain''s chairs by Friday. Lock money factor before quoting again.',
    '[{"kind":"visit","t":"First visit · internet lead","d":"8d"},{"kind":"numbers","t":"Quoted 36mo lease, $0 down","d":"4d"},{"kind":"objection","t":"Asked about captain''s chair availability","d":"2d"}]'::jsonb,
    'active'),
  (demo_uid, 'Derek', 'Osei', '(773) 555-0199', '''25 i4 M50', 'Skyscraper Grey', '69K', '''19 330i',
    'TODAY', 95, today, ARRAY['EV','M Series'],
    'First EV. Concerned about home charging — promised to text him the wall connector specs. Test drive scheduled today 2:30. Pre-approved with credit union, just needs final number.',
    'Test drive at 2:30 — give the regen demo on Skyline Blvd. Have final out-the-door number ready; he''s pre-approved.',
    '[{"kind":"visit","t":"First visit · walked the i4 inventory","d":"5d"},{"kind":"objection","t":"Concerned about home charging install","d":"3d"},{"kind":"docs","t":"Sent wall connector specs + install partners","d":"1d"},{"kind":"test-drive","t":"Test drive today at 2:30","d":"0d"}]'::jsonb,
    'active'),
  (demo_uid, 'Sofia', 'Alvarez-Chen', '(212) 555-0147', '''26 M4 Coupe', 'Isle of Man Green', '92K', '''21 Q5',
    'THIS WEEK', 82, today - 4, ARRAY['M Series','Coupe'],
    'Going cold — haven''t replied in 4 days. Last touch was the build sheet PDF. Need to recover with something other than price. Try the carbon ceramic package angle.',
    'Cold recovery — don''t lead with price. Send carbon ceramic package walkaround video. Mention the IoM Green allocation closes Monday.',
    '[{"kind":"visit","t":"First visit · walked all M cars","d":"12d"},{"kind":"numbers","t":"Quoted MSRP + options","d":"7d"},{"kind":"docs","t":"Sent build sheet PDF","d":"5d"},{"kind":"no-response","t":"No reply on follow-up text","d":"2d"}]'::jsonb,
    'active'),
  (demo_uid, 'Jonah', 'Breckenridge', '(415) 555-0133', '''26 X3 M50', 'Black Sapphire', '71K', '''18 GLC 300',
    'THIS MONTH', 65, today - 6, ARRAY['SUV','Trade-in'],
    'Cross-shopping the GLC 43. Hung up on third-row option which we don''t offer. Stayed in the conversation when I sent the cargo dimensions comparison.',
    NULL, '[]'::jsonb, 'active'),
  (demo_uid, 'Rachel', 'Kim', '(617) 555-0171', '''26 iX xDrive50', 'Storm Bay', '88K', 'None',
    'THIS MONTH', 60, today - 5, ARRAY['EV','Cash'],
    'Cash buyer, no trade. Researching slowly — pulled spec sheets twice. Doesn''t want to be sold to. Just keep her informed when allocations open.',
    NULL, '[]'::jsonb, 'active'),
  (demo_uid, 'Theo', 'Whitfield', '(305) 555-0124', '''25 540i xDrive', 'Tanzanite Blue', '64K', '''17 528i',
    'THIS MONTH', 55, today - 8, ARRAY['Loyalty','Sedan'],
    '8 days since last touch — getting cold. He''s been with us since 2017. Loyalty pricing should be on the table. Pull his service history before the next call.',
    NULL, '[]'::jsonb, 'active'),
  (demo_uid, 'Amelia', 'Nowak', '(702) 555-0158', '''26 X7 xDrive40i', 'Mineral White', '98K', '''20 Q7',
    'NEXT QTR', 35, today - 14, ARRAY['SUV','Family'],
    'Q7 lease matures in September. Wants 3-row, leather, and the executive lounge package. Just shopping — not ready to buy yet but worth a touch every 2-3 weeks.',
    NULL, '[]'::jsonb, 'prospect'),
  (demo_uid, 'Ravi', 'Balasubramanian', '(512) 555-0163', '''25 M340i', 'Portimao Blue', '58K', 'None',
    'NEXT QTR', 30, today - 21, ARRAY['Sedan'],
    'Young professional, first nice car. Doing his research thoroughly. Replied positively to my walkaround video. Long-cycle prospect — keep nurturing.',
    NULL, '[]'::jsonb, 'prospect'),
  (demo_uid, 'Noor', 'Hassan', '(206) 555-0142', '''26 X1 xDrive28i', 'Cape York Green', '45K', '''16 X1',
    'NEXT QTR', 40, today - 11, ARRAY['SUV','Repeat','Loyalty'],
    'Returning X1 owner. Loved her last one. Waiting on a Cape York Green allocation — only 4 in the region. Promised to call the second one drops.',
    NULL, '[]'::jsonb, 'prospect')
  ON CONFLICT DO NOTHING;
END $$;
