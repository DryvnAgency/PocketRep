-- Seed the 25 mock deals from design/extracted/data.js for the demo user
-- so the v2 Metrics tab renders the full YTD layout (Jan-Apr 2026 = 4 months).
-- Idempotent via ON CONFLICT DO NOTHING.

DO $$
DECLARE demo_uid uuid := 'd0000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.deals (user_id, title, vehicle, stock, amount, front_gross, back_gross, closed_at, deal_type, funding)
  VALUES
  (demo_uid, 'Theresa Wen',         '''26 M3 Competition',  'P8421', 4280, 2900, 1380, '2026-04-18', 'NEW', 'finance'),
  (demo_uid, 'Marco Ishibashi',     '''25 X3 xDrive30i',    'P8412', 2940, 1800, 1140, '2026-04-15', 'NEW', 'lease'),
  (demo_uid, 'Valentina Ruiz',      '''24 330i CPO',        'C7733', 1850, 1100,  750, '2026-04-12', 'CPO', 'finance'),
  (demo_uid, 'Harrison Park',       '''26 i4 eDrive40',     'P8398', 3120, 2100, 1020, '2026-04-09', 'NEW', 'lease'),
  (demo_uid, 'Yusuf Okonkwo',       '''26 X5 xDrive40i',    'P8401', 3660, 2400, 1260, '2026-04-06', 'NEW', 'finance'),
  (demo_uid, 'Lena Volkov',         '''23 M240i CPO',       'C7721', 1420,  900,  520, '2026-04-03', 'CPO', 'cash'),
  (demo_uid, 'Daniel Castellanos',  '''26 X1 xDrive28i',    'P8389', 2210, 1500,  710, '2026-04-01', 'NEW', 'finance'),
  (demo_uid, 'Olivia Ferraro',      '''26 540i xDrive',     'P8341', 3450, 2300, 1150, '2026-03-28', 'NEW', 'finance'),
  (demo_uid, 'Anand Krishnamurthy', '''26 iX xDrive50',     'P8332', 4120, 2700, 1420, '2026-03-24', 'NEW', 'lease'),
  (demo_uid, 'Margaret Sutton',     '''24 X3 CPO',          'C7698', 1980, 1250,  730, '2026-03-20', 'CPO', 'finance'),
  (demo_uid, 'Kenji Yamashita',     '''26 M4 Coupe',        'P8311', 5240, 3500, 1740, '2026-03-15', 'NEW', 'finance'),
  (demo_uid, 'Rebecca Holloway',    '''26 X5 xDrive40i',    'P8298', 3580, 2400, 1180, '2026-03-11', 'NEW', 'lease'),
  (demo_uid, 'Tomas Larsson',       '''26 330i xDrive',     'P8284', 2680, 1700,  980, '2026-03-06', 'NEW', 'finance'),
  (demo_uid, 'Whitney Anh-Tu',      '''23 X4 M40i CPO',     'C7672', 1620, 1050,  570, '2026-03-02', 'CPO', 'cash'),
  (demo_uid, 'Phillip Asante',      '''26 i7 xDrive60',     'P8221', 5860, 4000, 1860, '2026-02-26', 'NEW', 'lease'),
  (demo_uid, 'Saoirse Connolly',    '''26 X7 xDrive40i',    'P8204', 4180, 2750, 1430, '2026-02-21', 'NEW', 'finance'),
  (demo_uid, 'Brandon Tellez',      '''26 230i Coupe',      'P8189', 2240, 1400,  840, '2026-02-15', 'NEW', 'lease'),
  (demo_uid, 'Charlotte Beaufort',  '''24 i4 M50 CPO',      'C7621', 1840, 1200,  640, '2026-02-09', 'CPO', 'finance'),
  (demo_uid, 'Mateo Reyes-Cordero', '''26 X3 M50',          'P8167', 3320, 2200, 1120, '2026-02-04', 'NEW', 'finance'),
  (demo_uid, 'Anastasia Petrova',   '''26 M5 Sedan',        'P8112', 6420, 4400, 2020, '2026-01-28', 'NEW', 'finance'),
  (demo_uid, 'Cole Erickson',       '''26 X1 xDrive28i',    'P8089', 2080, 1300,  780, '2026-01-22', 'NEW', 'lease'),
  (demo_uid, 'Imani Sullivan',      '''26 i4 eDrive40',     'P8071', 2940, 1900, 1040, '2026-01-17', 'NEW', 'lease'),
  (demo_uid, 'Felix Brennaman',     '''23 530i CPO',        'C7558', 1740, 1100,  640, '2026-01-12', 'CPO', 'finance'),
  (demo_uid, 'Sienna Park-Whitley', '''26 X5 M60i',         'P8042', 4760, 3200, 1560, '2026-01-08', 'NEW', 'finance'),
  (demo_uid, 'Roman Calatrava',     '''26 M340i xDrive',    'P8033', 3140, 2000, 1140, '2026-01-04', 'NEW', 'lease')
  ON CONFLICT DO NOTHING;
END $$;
