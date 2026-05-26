-- Add May 2026 (current month at time of demo) deals for the demo user so
-- the Metrics MTD panel renders with real numbers instead of $0.

DO $$
DECLARE demo_uid uuid := 'd0000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.deals (user_id, title, vehicle, stock, amount, front_gross, back_gross, closed_at, deal_type, funding)
  VALUES
  (demo_uid, 'Sterling Voss',     '''26 M4 Competition',  'P8512', 4980, 3300, 1680, '2026-05-22', 'NEW', 'finance'),
  (demo_uid, 'Camille Berthelot', '''26 X3 xDrive30i',    'P8501', 2820, 1850,  970, '2026-05-18', 'NEW', 'lease'),
  (demo_uid, 'Hugo Marchetti',    '''25 i4 M50 CPO',      'C7754', 1960, 1280,  680, '2026-05-12', 'CPO', 'finance'),
  (demo_uid, 'Eleanor Pham',      '''26 X7 xDrive40i',    'P8489', 4340, 2900, 1440, '2026-05-08', 'NEW', 'finance'),
  (demo_uid, 'Idris Bakambu',     '''26 230i Coupe',      'P8478', 2180, 1400,  780, '2026-05-04', 'NEW', 'lease')
  ON CONFLICT DO NOTHING;
END $$;
