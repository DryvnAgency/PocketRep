// Mock data for PocketRep
const CONTACTS = [
  { id: 1, name: 'Marcus Holloway',    vehicle: "'26 M3 Competition",     trim: 'Brooklyn Grey · xDrive',    tier: 'hot',   days: 1,  plan: 'THIS WEEK',  phone: '(312) 555-0184', budget: '82K', tradeIn: "'22 M240i",
    tags: ['M Series', 'Repeat'], photo: null,
    notes: "Wife is on board. Wants Brooklyn Grey specifically — won't budge on color. Open to extending term to 60 if MSRP holds. Mentioned trade-in dependency twice; lock that number before they walk.",
    milestones: [
      { kind: 'visit',     t: 'Showed Brooklyn Grey, walked Frozen Black', d: '4d' },
      { kind: 'numbers',   t: 'Went over payment scenarios at 60mo', d: '3d' },
      { kind: 'docs',      t: 'Sent payment comparison PDF', d: '3d' },
      { kind: 'test-drive',t: 'Test drive scheduled · Saturday 11:00', d: '1d' },
    ],
    nextStep: "Lock trade-in number on the '22 M240i before Saturday — he'll walk without it. Have appraisal team pre-quote." },
  { id: 2, name: 'Priya Raman',        vehicle: "'26 X5 xDrive40i",       trim: 'Alpine White · Premium',    tier: 'hot',   days: 2,  plan: 'THIS WEEK',  phone: '(646) 555-0112', budget: '74K', tradeIn: 'None',
    tags: ['SUV', 'Lease'], photo: null,
    notes: "Coming off a Q7 lease. Wants the captain's chairs in the 2nd row — confirm package availability. 36mo lease, money factor sensitive. Decision-maker: her, no spouse involved.",
    milestones: [
      { kind: 'visit',     t: 'First visit · internet lead', d: '8d' },
      { kind: 'numbers',   t: 'Quoted 36mo lease, $0 down', d: '4d' },
      { kind: 'objection', t: 'Asked about captain\'s chair availability', d: '2d' },
    ],
    nextStep: "Confirm the Premium Package allocation in Alpine White with captain's chairs by Friday. Lock money factor before quoting again." },
  { id: 3, name: 'Derek Osei',         vehicle: "'25 i4 M50",             trim: 'Skyscraper Grey',           tier: 'hot',   days: 0,  plan: 'TODAY',      phone: '(773) 555-0199', budget: '69K', tradeIn: "'19 330i",
    tags: ['EV', 'M Series'], photo: null,
    notes: "First EV. Concerned about home charging — promised to text him the wall connector specs. Test drive scheduled today 2:30. Pre-approved with credit union, just needs final number.",
    milestones: [
      { kind: 'visit',     t: 'First visit · walked the i4 inventory', d: '5d' },
      { kind: 'objection', t: 'Concerned about home charging install', d: '3d' },
      { kind: 'docs',      t: 'Sent wall connector specs + install partners', d: '1d' },
      { kind: 'test-drive',t: 'Test drive today at 2:30', d: '0d' },
    ],
    nextStep: "Test drive at 2:30 — give the regen demo on Skyline Blvd. Have final out-the-door number ready; he's pre-approved." },
  { id: 4, name: 'Sofia Alvarez-Chen', vehicle: "'26 M4 Coupe",           trim: 'Isle of Man Green',         tier: 'hot',   days: 4,  plan: 'THIS WEEK',  phone: '(212) 555-0147', budget: '92K', tradeIn: "'21 Q5",
    tags: ['M Series', 'Coupe'], photo: null,
    notes: "Going cold — haven't replied in 4 days. Last touch was the build sheet PDF. Need to recover with something other than price. Try the carbon ceramic package angle.",
    milestones: [
      { kind: 'visit',      t: 'First visit · walked all M cars', d: '12d' },
      { kind: 'numbers',    t: 'Quoted MSRP + options', d: '7d' },
      { kind: 'docs',       t: 'Sent build sheet PDF', d: '5d' },
      { kind: 'no-response',t: 'No reply on follow-up text', d: '2d' },
    ],
    nextStep: "Cold recovery — don't lead with price. Send carbon ceramic package walkaround video. Mention the IoM Green allocation closes Monday." },
  { id: 5, name: 'Jonah Breckenridge', vehicle: "'26 X3 M50",             trim: 'Black Sapphire',            tier: 'warm',  days: 6,  plan: 'THIS MONTH', phone: '(415) 555-0133', budget: '71K', tradeIn: "'18 GLC 300",
    tags: ['SUV', 'Trade-in'], photo: null,
    notes: "Cross-shopping the GLC 43. Hung up on third-row option which we don't offer. Stayed in the conversation when I sent the cargo dimensions comparison." },
  { id: 6, name: 'Rachel Kim',         vehicle: "'26 iX xDrive50",        trim: 'Storm Bay',                 tier: 'warm',  days: 5,  plan: 'THIS MONTH', phone: '(617) 555-0171', budget: '88K', tradeIn: 'None',
    tags: ['EV', 'Cash'], photo: null,
    notes: "Cash buyer, no trade. Researching slowly — pulled spec sheets twice. Doesn't want to be sold to. Just keep her informed when allocations open." },
  { id: 7, name: 'Theo Whitfield',     vehicle: "'25 540i xDrive",        trim: 'Tanzanite Blue',            tier: 'warm',  days: 8,  plan: 'THIS MONTH', phone: '(305) 555-0124', budget: '64K', tradeIn: "'17 528i",
    tags: ['Loyalty', 'Sedan'], photo: null,
    notes: "8 days since last touch — getting cold. He's been with us since 2017. Loyalty pricing should be on the table. Pull his service history before the next call." },
  { id: 8, name: 'Amelia Nowak',       vehicle: "'26 X7 xDrive40i",       trim: 'Mineral White',             tier: 'watch', days: 14, plan: 'NEXT QTR',   phone: '(702) 555-0158', budget: '98K', tradeIn: "'20 Q7",
    tags: ['SUV', 'Family'], photo: null,
    notes: "Q7 lease matures in September. Wants 3-row, leather, and the executive lounge package. Just shopping — not ready to buy yet but worth a touch every 2-3 weeks." },
  { id: 9, name: 'Ravi Balasubramanian', vehicle: "'25 M340i",            trim: 'Portimao Blue',             tier: 'watch', days: 21, plan: 'NEXT QTR',   phone: '(512) 555-0163', budget: '58K', tradeIn: 'None',
    tags: ['Sedan'], photo: null,
    notes: "Young professional, first nice car. Doing his research thoroughly. Replied positively to my walkaround video. Long-cycle prospect — keep nurturing." },
  { id:10, name: 'Noor Hassan',        vehicle: "'26 X1 xDrive28i",       trim: 'Cape York Green',           tier: 'watch', days: 11, plan: 'NEXT QTR',   phone: '(206) 555-0142', budget: '45K', tradeIn: "'16 X1",
    tags: ['SUV', 'Repeat', 'Loyalty'], photo: null,
    notes: "Returning X1 owner. Loved her last one. Waiting on a Cape York Green allocation — only 4 in the region. Promised to call the second one drops." },
];

// Universe of custom tags reps have created. Used for filter chips and tag picker.
const STARTER_TAGS = [
  { name: 'SUV',             color: '#42b883' },
  { name: 'EV',              color: '#5a8fe8' },
  { name: 'Lease',           color: '#a86bd1' },
  { name: 'Used',            color: '#8a90a0' },
  { name: 'M Series',        color: '#e05252' },
  { name: 'Coupe',           color: '#e08c52' },
  { name: 'Sedan',           color: '#d4a843' },
  { name: 'Cash',            color: '#42b883' },
  { name: 'Loyalty',         color: '#f0c060' },
  { name: 'Repeat',          color: '#f0c060' },
  { name: 'Trade-in',        color: '#a86bd1' },
  { name: 'Family',          color: '#42b883' },
];

const DEALS = [
  // April 2026 — current month
  { id: 1,  date: '2026-04-18', name: 'Theresa Wen',         contactId: null, stock: 'P8421', vehicle: "'26 M3 Competition",  amount: 4280, frontGross: 2900, backGross: 1380, type: 'NEW', funding: 'finance' },
  { id: 2,  date: '2026-04-15', name: 'Marco Ishibashi',     contactId: null, stock: 'P8412', vehicle: "'25 X3 xDrive30i",    amount: 2940, frontGross: 1800, backGross: 1140, type: 'NEW', funding: 'lease' },
  { id: 3,  date: '2026-04-12', name: 'Valentina Ruiz',      contactId: null, stock: 'C7733', vehicle: "'24 330i CPO",        amount: 1850, frontGross: 1100, backGross:  750, type: 'CPO', funding: 'finance' },
  { id: 4,  date: '2026-04-09', name: 'Harrison Park',       contactId: null, stock: 'P8398', vehicle: "'26 i4 eDrive40",     amount: 3120, frontGross: 2100, backGross: 1020, type: 'NEW', funding: 'lease' },
  { id: 5,  date: '2026-04-06', name: 'Yusuf Okonkwo',       contactId: null, stock: 'P8401', vehicle: "'26 X5 xDrive40i",    amount: 3660, frontGross: 2400, backGross: 1260, type: 'NEW', funding: 'finance' },
  { id: 6,  date: '2026-04-03', name: 'Lena Volkov',         contactId: null, stock: 'C7721', vehicle: "'23 M240i CPO",       amount: 1420, frontGross:  900, backGross:  520, type: 'CPO', funding: 'cash' },
  { id: 7,  date: '2026-04-01', name: 'Daniel Castellanos',  contactId: null, stock: 'P8389', vehicle: "'26 X1 xDrive28i",    amount: 2210, frontGross: 1500, backGross:  710, type: 'NEW', funding: 'finance' },
  // March 2026
  { id: 8,  date: '2026-03-28', name: 'Olivia Ferraro',      contactId: null, stock: 'P8341', vehicle: "'26 540i xDrive",     amount: 3450, frontGross: 2300, backGross: 1150, type: 'NEW', funding: 'finance' },
  { id: 9,  date: '2026-03-24', name: 'Anand Krishnamurthy', contactId: null, stock: 'P8332', vehicle: "'26 iX xDrive50",     amount: 4120, frontGross: 2700, backGross: 1420, type: 'NEW', funding: 'lease' },
  { id:10,  date: '2026-03-20', name: 'Margaret Sutton',     contactId: null, stock: 'C7698', vehicle: "'24 X3 CPO",          amount: 1980, frontGross: 1250, backGross:  730, type: 'CPO', funding: 'finance' },
  { id:11,  date: '2026-03-15', name: 'Kenji Yamashita',     contactId: null, stock: 'P8311', vehicle: "'26 M4 Coupe",        amount: 5240, frontGross: 3500, backGross: 1740, type: 'NEW', funding: 'finance' },
  { id:12,  date: '2026-03-11', name: 'Rebecca Holloway',    contactId: null, stock: 'P8298', vehicle: "'26 X5 xDrive40i",    amount: 3580, frontGross: 2400, backGross: 1180, type: 'NEW', funding: 'lease' },
  { id:13,  date: '2026-03-06', name: 'Tomas Larsson',       contactId: null, stock: 'P8284', vehicle: "'26 330i xDrive",     amount: 2680, frontGross: 1700, backGross:  980, type: 'NEW', funding: 'finance' },
  { id:14,  date: '2026-03-02', name: 'Whitney Anh-Tu',      contactId: null, stock: 'C7672', vehicle: "'23 X4 M40i CPO",     amount: 1620, frontGross: 1050, backGross:  570, type: 'CPO', funding: 'cash' },
  // February 2026
  { id:15,  date: '2026-02-26', name: 'Phillip Asante',      contactId: null, stock: 'P8221', vehicle: "'26 i7 xDrive60",     amount: 5860, frontGross: 4000, backGross: 1860, type: 'NEW', funding: 'lease' },
  { id:16,  date: '2026-02-21', name: 'Saoirse Connolly',    contactId: null, stock: 'P8204', vehicle: "'26 X7 xDrive40i",    amount: 4180, frontGross: 2750, backGross: 1430, type: 'NEW', funding: 'finance' },
  { id:17,  date: '2026-02-15', name: 'Brandon Tellez',      contactId: null, stock: 'P8189', vehicle: "'26 230i Coupe",      amount: 2240, frontGross: 1400, backGross:  840, type: 'NEW', funding: 'lease' },
  { id:18,  date: '2026-02-09', name: 'Charlotte Beaufort',  contactId: null, stock: 'C7621', vehicle: "'24 i4 M50 CPO",      amount: 1840, frontGross: 1200, backGross:  640, type: 'CPO', funding: 'finance' },
  { id:19,  date: '2026-02-04', name: 'Mateo Reyes-Cordero', contactId: null, stock: 'P8167', vehicle: "'26 X3 M50",          amount: 3320, frontGross: 2200, backGross: 1120, type: 'NEW', funding: 'finance' },
  // January 2026
  { id:20,  date: '2026-01-28', name: 'Anastasia Petrova',   contactId: null, stock: 'P8112', vehicle: "'26 M5 Sedan",        amount: 6420, frontGross: 4400, backGross: 2020, type: 'NEW', funding: 'finance' },
  { id:21,  date: '2026-01-22', name: 'Cole Erickson',       contactId: null, stock: 'P8089', vehicle: "'26 X1 xDrive28i",    amount: 2080, frontGross: 1300, backGross:  780, type: 'NEW', funding: 'lease' },
  { id:22,  date: '2026-01-17', name: 'Imani Sullivan',      contactId: null, stock: 'P8071', vehicle: "'26 i4 eDrive40",     amount: 2940, frontGross: 1900, backGross: 1040, type: 'NEW', funding: 'lease' },
  { id:23,  date: '2026-01-12', name: 'Felix Brennaman',     contactId: null, stock: 'C7558', vehicle: "'23 530i CPO",        amount: 1740, frontGross: 1100, backGross:  640, type: 'CPO', funding: 'finance' },
  { id:24,  date: '2026-01-08', name: 'Sienna Park-Whitley', contactId: null, stock: 'P8042', vehicle: "'26 X5 M60i",         amount: 4760, frontGross: 3200, backGross: 1560, type: 'NEW', funding: 'finance' },
  { id:25,  date: '2026-01-04', name: 'Roman Calatrava',     contactId: null, stock: 'P8033', vehicle: "'26 M340i xDrive",    amount: 3140, frontGross: 2000, backGross: 1140, type: 'NEW', funding: 'lease' },
];

// Default pay plan structure
const DEFAULT_PAY_PLAN = {
  frontPct: 25,   // % of front gross
  backPct: 5,     // % of back gross
  flatMini: 200,  // minimum per unit
  unitBonuses: [
    { units: 10, bonus: 500 },
    { units: 15, bonus: 1000 },
    { units: 20, bonus: 1500 },
  ],
  csiBonus: 400,        // monthly Unit bonus
  manuBonus: 250,       // per-unit Spiffs
  baseSalary: 2000,     // monthly base
};

const REX_MESSAGES = [
  { from: 'rex', text: "Morning. You've got 4 HOT contacts aging — Sofia Alvarez-Chen hits day 4 today.", time: '8:42' },
  { from: 'user', text: "pull up Marcus Holloway", time: '8:43' },
  { from: 'rex', text: "Marcus Holloway · '26 M3 Competition · Brooklyn Grey xDrive · last contact 1d ago. Budget 82K, trade-in '22 M240i. Plan: THIS WEEK.", time: '8:43' },
  { from: 'user', text: "what's a fair trade value on the M240i", time: '8:44' },
  { from: 'rex', text: "'22 M240i xDrive, 28–34k mi bucket, pulling comps... 42.8K retail / 38.2K trade-in floor. Recent auction avg: 39.6K. Lean 39K on the write-up — gives you a 1K cushion.", time: '8:44' },
];

const QUICK_CHIPS = [
  'Pull comps on trade',
  'Draft follow-up text',
  'Inventory match',
  'Monthly payment calc',
  'CPO warranty terms',
  'Lease vs finance',
];

Object.assign(window, { CONTACTS, DEALS, REX_MESSAGES, QUICK_CHIPS, DEFAULT_PAY_PLAN, STARTER_TAGS });
