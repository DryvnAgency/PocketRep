// ─── PocketRep App Constants ──────────────────────────────────────────────────
// Ported from Snack v8 FINAL — single source of truth for the multi-file app

import { Platform, Alert, Linking } from 'react-native';

export const SUPABASE_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dnJhdXFkb2V2d213d3FsZmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzczOTAsImV4cCI6MjA4OTk1MzM5MH0.D0Mu7wWB59NUr7cFtkl_00ijbseSz_SsV86pwJSn0s0';

// ─── STRIPE ───────────────────────────────────────────────────────────────────
export const STRIPE = {
  solo:  'https://buy.stripe.com/dRmcN6cQr4kgbIF4wqcbC01',
  pro:   'https://buy.stripe.com/5kQeVedUv3gc2857ICcbC02',
  elite: 'https://buy.stripe.com/14A8wQdUv3gccMJ2oicbC03',
};

// ─── PLAN LIMITS ──────────────────────────────────────────────────────────────
export const MAX_ACCOUNTS = 100;
export const MASS_TEXT_LIMITS: Record<string, number> = { solo: 5, pro: 50, elite: 100 };
export const SUPPORT_EMAIL = 'service@pocketrep.pro';

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
export const SEQUENCE_ASSIGNMENT_KEY     = 'pocketrep_sequence_assignments_v1';
export const LOCAL_SEQUENCE_STORAGE_KEY  = 'pocketrep_custom_sequences_v1';
export const LOCAL_ARCHIVED_SEQ_IDS_KEY  = 'pocketrep_archived_sequence_ids_v1';
export const LOCAL_CONTACT_META_KEY      = 'pocketrep_contact_meta_v1';
export const MASS_TEXT_HISTORY_KEY       = 'pocketrep_mass_text_history_v1';
export const DIGEST_TIME_KEY             = 'pocketrep_digest_time';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
export const C = {
  ink:'#0c0c0e', ink2:'#141418', ink3:'#1c1c22',
  surface:'#111116', surface2:'#18181f',
  border:'#252830', border2:'#2e3340',
  gold:'#d4a843', gold2:'#f0c060',
  goldBg:'rgba(212,168,67,0.10)', goldBorder:'rgba(212,168,67,0.22)',
  text:'#ffffff', grey:'#5a6070', grey2:'#8a90a0', grey3:'#b4bac8',
  green:'#42b883', red:'#e05252', blue:'#378ADD',
};

// ─── INDUSTRIES ───────────────────────────────────────────────────────────────
export const INDUSTRIES = [
  { label: 'Automotive Sales',    value: 'auto',      icon: '🚗' },
  { label: 'Mortgage / Lending',  value: 'mortgage',  icon: '🏦' },
  { label: 'Real Estate',         value: 'realestate',icon: '🏠' },
  { label: 'Insurance',           value: 'insurance', icon: '📋' },
  { label: 'Solar / Home Services',value:'solar',     icon: '☀️' },
  { label: 'B2B Sales',           value: 'b2b',       icon: '💼' },
];

export const STAGE_COLORS: Record<string, string> = {
  prospect: '#378ADD',
  active:   '#42b883',
  sold:     '#d4a843',
  dormant:  '#8a90a0',
  lost:     '#e05252',
};

// ─── OBJECTIONS ───────────────────────────────────────────────────────────────
export const OBJECTIONS: Record<string, string[]> = {
  auto:       ['Payment too high','Need to think','Spouse approval','Saw cheaper online','Low trade offer'],
  mortgage:   ['Rate is too high','Not ready yet','Credit isn\'t ready','Down payment concern','Already with someone'],
  realestate: ['Market is bad','Just looking','Price too high','Need to sell first'],
  insurance:  ['Too expensive','Have enough coverage','Need to shop around','Spouse needs to decide'],
  solar:      ['Too expensive upfront','HOA concern','Roof is old','Need to research more'],
  b2b:        ['Budget timing','Need committee approval','Happy with current vendor','ROI unclear'],
  other:      ['Need to think','Price too high','Need approval','Not the right time'],
};

// ─── TAGS ─────────────────────────────────────────────────────────────────────
export const ALL_SUGGESTED_TAGS = [
  'hot','vip','referral','follow-up','renewal','birthday','repeat',
  'lease','finance','cash','conquest','trade-in','high-mileage','service-drive','end-of-lease','first-time-buyer',
  'refi','purchase','pre-approved','buyer','seller','investor','equity-rich',
  'bundle-opportunity','rate-review','lapsed',
  'homeowner','high-utility','site-visit','proposal-sent',
  'decision-maker','demo-done','q4-budget','at-risk',
];

// ─── DEFAULT SEQUENCE TEMPLATES ───────────────────────────────────────────────
export const DEFAULT_SEQUENCE_TEMPLATES: any[] = [
  {
    id: 'tpl-auto-last-month-sold',
    name: 'Last Month Sold Customer',
    industry: 'auto',
    description: '5-step post-sale nurture to stay in touch with last month\'s sold customers and drive referrals, service retention, and future trade timing.',
    is_template: true,
    is_custom: false,
    sequence_steps: [
      { id:'tpl-auto-1', step_number:1, delay_days:0,  channel:'text',  message_template:'Hey {{first_name}}, it\'s {{rep_name}} from {{company}} — just making sure you\'re loving your vehicle so far. Need anything at all, I\'ve got you.', ai_personalize:true },
      { id:'tpl-auto-2', step_number:2, delay_days:7,  channel:'text',  message_template:'Hey {{first_name}}, quick check-in — any questions on features, service, or your new ride? I\'m here for you.', ai_personalize:true },
      { id:'tpl-auto-3', step_number:3, delay_days:21, channel:'call',  message_template:'Call {{first_name}} and thank them again. Ask for feedback, referrals, and whether they need help setting service.', ai_personalize:false },
      { id:'tpl-auto-4', step_number:4, delay_days:45, channel:'text',  message_template:'Hey {{first_name}}, just checking in. If anyone around you needs a vehicle, I\'d love to take great care of them too.', ai_personalize:true },
      { id:'tpl-auto-5', step_number:5, delay_days:90, channel:'text',  message_template:'Hey {{first_name}}, hope everything\'s been great with your vehicle. I\'m still your go-to for anything sales, trade, service, or parts related.', ai_personalize:true },
    ],
  },
  {
    id: 'tpl-mortgage-rate-drop',
    name: 'Rate Drop Alert',
    industry: 'mortgage',
    description: '3-step rate-drop follow-up sequence for warm refinance or purchase leads.',
    is_template: true,
    is_custom: false,
    sequence_steps: [
      { id:'tpl-mortgage-1', step_number:1, delay_days:0, channel:'text',  message_template:'Hey {{first_name}}, rates shifted and I wanted to reach out quickly. Want me to run updated numbers for you?', ai_personalize:true },
      { id:'tpl-mortgage-2', step_number:2, delay_days:2, channel:'call',  message_template:'Call {{first_name}} and confirm whether they want an updated payment breakdown or approval review.', ai_personalize:false },
      { id:'tpl-mortgage-3', step_number:3, delay_days:5, channel:'email', message_template:'Subject: Updated options\n\nHey {{first_name}}, I put together an updated path based on the latest market movement. Want me to send it over?', ai_personalize:true },
    ],
  },
  {
    id: 'tpl-realestate-equity',
    name: 'Homeowner Equity Check',
    industry: 'realestate',
    description: '4-step homeowner touch pattern for equity updates and move-up opportunities.',
    is_template: true,
    is_custom: false,
    sequence_steps: [
      { id:'tpl-re-1', step_number:1, delay_days:0,  channel:'text',  message_template:'Hey {{first_name}}, I wanted to give you a quick homeowner equity check. Want me to send you an updated value range?', ai_personalize:true },
      { id:'tpl-re-2', step_number:2, delay_days:3,  channel:'call',  message_template:'Call {{first_name}} and ask whether they have thought about moving, investing, or cashing out equity.', ai_personalize:false },
      { id:'tpl-re-3', step_number:3, delay_days:10, channel:'email', message_template:'Subject: Quick home value update\n\nHey {{first_name}}, I pulled together a simple value snapshot and a few options based on the market. Happy to send it over.', ai_personalize:true },
      { id:'tpl-re-4', step_number:4, delay_days:30, channel:'text',  message_template:'Hey {{first_name}}, still happy to help if you want to know what your home could sell for in today\'s market.', ai_personalize:true },
    ],
  },
];

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

export const normalizePhoneForSms = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
};

export const personalizeTemplate = (template = '', contact: any = {}) => {
  const firstName = contact?.first_name || 'there';
  return String(template || '').replace(/\{\{first_name\}\}/gi, firstName);
};

export const openSmsComposer = async ({ phones = [], body = '' }: { phones?: string[]; body?: string } = {}) => {
  const recipients = (phones || []).map(normalizePhoneForSms).filter(Boolean);
  if (recipients.length === 0) throw new Error('No valid phone numbers were found.');
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${recipients.join(',')}${separator}body=${encodeURIComponent(body)}`;
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (!supported) throw new Error('SMS is not available on this device.');
  await Linking.openURL(url);
};

export const openPhoneDialer = async (phone: string) => {
  const clean = normalizePhoneForSms(phone);
  if (!clean) throw new Error('No valid phone number is on file.');
  const url = `tel:${clean}`;
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (!supported) throw new Error('Phone calling is not available on this device.');
  await Linking.openURL(url);
};

export const openEmailComposer = async (email: string) => {
  const clean = String(email || '').trim();
  if (!clean) throw new Error('No email is on file.');
  const url = `mailto:${clean}`;
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (!supported) throw new Error('Email is not available on this device.');
  await Linking.openURL(url);
};

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const extractAiText = (value: any, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => extractAiText(v, '')).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    return value.text || value.message || value.result || value.output || value.reply || JSON.stringify(value, null, 2);
  }
  return fallback;
};

export const confirmDeleteContact = (contact: any, onConfirm: () => void) => {
  Alert.alert(
    'Delete Contact',
    `Delete ${contact?.first_name || 'this contact'}? This hides them from your Heat Sheet and contacts list.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onConfirm }]
  );
};

export const confirmDeleteSequence = (sequence: any, onConfirm: () => void) => {
  Alert.alert(
    'Delete Sequence',
    `Delete "${sequence?.name || 'this sequence'}"?`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onConfirm }]
  );
};

export const confirmRemoveFromHeatSheet = (contact: any, onConfirm: () => void) => {
  Alert.alert(
    'Remove from Heat Sheet',
    `Remove ${contact?.first_name || 'this contact'} from today's Heat Sheet? They stay saved in your Contacts.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onConfirm }]
  );
};

export const generateFallbackRebuttal = ({ contact, objection, plan = 'pro', custom = false }: any) => {
  const name = contact?.first_name || 'they';
  const product = contact?.product || 'the deal';
  const note = contact?.notes ? `Use this context: ${String(contact.notes).slice(0, 120)}.` : '';
  const lines = [
    `Acknowledge it: "Totally fair, ${name}."`,
    `Lower resistance: "A lot of people feel that way before they see the full picture."`,
    `Reframe around ${product}: "Usually the real question is whether this solves what you wanted it to solve."`,
    `Move forward: "What would need to be true for you to feel good moving ahead today?"`,
  ];
  if (plan === 'elite' || custom) {
    lines.push(`Follow-up if they stall: "Is it more the payment, the timing, or just making sure it's the right fit?"`);
  }
  if (note) lines.push(note);
  return `Objection: ${objection}\n\n` + lines.join('\n');
};

export const generateFallbackBrief = (contact: any) => {
  if (!contact) return 'Select a contact first.';
  const tags = (contact.tags || []).length ? `Tags: ${(contact.tags || []).join(', ')}.` : '';
  return `${contact.first_name} ${contact.last_name || ''} is a ${contact.stage || 'prospect'} contact.${contact.product ? ` Product: ${contact.product}.` : ''} ${tags} ${contact.notes ? `Notes: ${String(contact.notes).slice(0, 160)}.` : 'No notes yet.'} Suggested opener: "Hey ${contact.first_name}, wanted to check in and help you take the next step — where are you at right now?"`;
};

export const generateFallbackCoaching = ({ message, contact, plan = 'pro' }: any) => {
  const responses = [
    `Do not react. Ask one question: "What is making you hesitate right now?" Stop talking. Let them fill the silence — that answer tells you everything.`,
    `Price is never the real objection. Say: "If the numbers were exactly where you needed them, would everything else be good?" Get a yes or find what is underneath it.`,
    `That deal is not dead. Say: "Before you go — on a scale of one to ten, how did you feel about the deal?" Anything above a six and you are still in it.`,
    `Stop defending. Start asking. "What would need to be true for this to work for you today?" Shut up and let them answer.`,
    `Do not chase. Say: "I hear you. One question — what specifically is making you hesitate?" Whatever they say next tells you exactly what to close.`,
    `Slow it down. "Help me understand — if everything else was right, what would still be in the way?" One clean question. Then silence.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
};

export const buildLocalSequence = (seq: any, steps: any[], userId = 'local-user') => ({
  id: `local-seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(seq?.name || '').trim(),
  industry: seq?.industry || 'auto',
  description: String(seq?.description || '').trim(),
  user_id: userId,
  is_custom: true,
  is_template: false,
  is_archived: false,
  created_at: new Date().toISOString(),
  sequence_steps: (steps || []).map((s, i) => ({
    id: `local-step-${i + 1}-${Date.now()}`,
    sequence_id: null,
    step_number: i + 1,
    delay_days: Number.isFinite(Number(s?.delay_days)) ? Number(s.delay_days) : 0,
    channel: s?.channel || 'text',
    message_template: String(s?.message_template || '').trim(),
    ai_personalize: !!s?.ai_personalize,
  })),
});

export const mergeSequencesById = (...groups: any[][]) => {
  const seen = new Set<string>();
  const merged: any[] = [];
  groups.flat().forEach(item => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });
  return merged;
};
