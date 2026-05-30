import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Dimensions, Alert, ActivityIndicator, Switch, Modal, Linking, Platform,
  AppState, AppStateStatus,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Sequence, SequenceStep } from '@/lib/types';
import { INDUSTRY_CONFIG } from '@/lib/industryConfig';
import {
  generateQueue, loadQueueState, saveQueueState, clearQueueState,
  markSentAndLog, type QueueItem,
} from '@/lib/messageQueue';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

const MASS_TEXT_KEY = 'pocketrep_mass_text_v1';
const { width: screenWidth } = Dimensions.get('window');

const CHANNEL_ICON: Record<string, string> = { text: '💬', call: '📞', email: '📧' };
const INDUSTRIES = ['auto']; // auto-first: other industries hidden (re-add keys here to restore)
const TEMPLATE_FILTERS = ['all', 'auto'] as const;
type TemplateFilter = typeof TEMPLATE_FILTERS[number];

const TEMPLATES: Sequence[] = [
  // ── NEW SOLD CUSTOMER — first 90 days (onboarding, CSI, referral, trade seed) ──
  {
    id: 'tpl_1',
    name: 'New Sold Customer (90-Day)',
    industry: 'auto',
    description: 'The complete post-delivery sequence: onboarding, CSI survey prep, referral asks, and the first trade-up seed.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't1s1', sequence_id: 'tpl_1', step_number: 1, delay_days: 1, channel: 'text', message_template: 'hey {{first_name}}, congrats again on the {{vehicle}}! hope the drive home put a big smile on your face. reach out anytime, i love hearing how it is going.', ai_personalize: false },
      { id: 't1s2', sequence_id: 'tpl_1', step_number: 2, delay_days: 3, channel: 'text', message_template: 'hey {{first_name}}, want to set up a quick 15 minute second delivery? i can walk you through bluetooth, the safety tech, and the little features most people miss. when works for you?', ai_personalize: false },
      { id: 't1s3', sequence_id: 'tpl_1', step_number: 3, delay_days: 5, channel: 'text', message_template: 'hey {{first_name}}, heads up, the manufacturer will send a short survey about your experience. if i took good care of you, a top score means a lot and helps me keep doing this. anything i can make right before it lands, just say the word.', ai_personalize: false },
      { id: 't1s4', sequence_id: 'tpl_1', step_number: 4, delay_days: 10, channel: 'text', message_template: 'hey {{first_name}}, one week in, how is the {{vehicle}} treating you? first service is a ways out, but i am here if anything comes up.', ai_personalize: false },
      { id: 't1s5', sequence_id: 'tpl_1', step_number: 5, delay_days: 17, channel: 'call', message_template: 'Two-week check-in call. Ask how they are loving it, clear up any questions, no pitch. Be useful and human, and warm up the relationship before any referral ask.', ai_personalize: false },
      { id: 't1s6', sequence_id: 'tpl_1', step_number: 6, delay_days: 30, channel: 'text', message_template: 'hey {{first_name}}, one month in! hope the {{vehicle}} is everything you wanted. if a friend or family member is ever looking, send them my way and i will take great care of them.', ai_personalize: false },
      { id: 't1s7', sequence_id: 'tpl_1', step_number: 7, delay_days: 60, channel: 'text', message_template: 'hey {{first_name}}, two months in, how are the miles adding up? hope every drive has been a good one. anything you need, i have got you.', ai_personalize: false },
      { id: 't1s8', sequence_id: 'tpl_1', step_number: 8, delay_days: 90, channel: 'call', message_template: '90-day call. Check in on the vehicle, ask about mileage and how life is going. Gently plant the trade-up seed: if they are driving more than expected, they may have real equity sooner than they think.', ai_personalize: false },
    ],
  },
  // ── QUICK SOLD FOLLOW-UP (lighter post-sale touch) ──────────────────────────
  {
    id: 'tpl_2',
    name: 'Quick Sold Follow-Up',
    industry: 'auto',
    description: 'A lighter five-touch post-sale sequence to stay close and earn the referral.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't2s1', sequence_id: 'tpl_2', step_number: 1, delay_days: 0, channel: 'text', message_template: 'hey {{first_name}}, how is the {{vehicle}} treating you so far? hope you love it.', ai_personalize: false },
      { id: 't2s2', sequence_id: 'tpl_2', step_number: 2, delay_days: 7, channel: 'text', message_template: 'hey {{first_name}}, any questions about the {{vehicle}} now that you have had a week with it? i am here for anything.', ai_personalize: false },
      { id: 't2s3', sequence_id: 'tpl_2', step_number: 3, delay_days: 21, channel: 'call', message_template: '21-day check-in call. Start with the ownership experience, any issues, any questions. Once they are happy, ask: do you know anyone in the market? I would love to take care of them the way I took care of you.', ai_personalize: false },
      { id: 't2s4', sequence_id: 'tpl_2', step_number: 4, delay_days: 45, channel: 'text', message_template: 'hey {{first_name}}, hope everything is great with the {{vehicle}}. if you know anyone looking, send them my way, i always take care of referrals.', ai_personalize: false },
      { id: 't2s5', sequence_id: 'tpl_2', step_number: 5, delay_days: 90, channel: 'text', message_template: 'hey {{first_name}}, coming up on 90 days, how is the {{vehicle}} running? anything you need, i am right here.', ai_personalize: false },
    ],
  },
  // ── UNSOLD LEAD RE-ENGAGEMENT (revive cold prospects) ───────────────────────
  {
    id: 'tpl_3',
    name: 'Unsold Lead Re-engagement',
    industry: 'auto',
    description: 'A 30-day sequence to reopen the conversation with prospects who went cold.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't3s1', sequence_id: 'tpl_3', step_number: 1, delay_days: 0, channel: 'text', message_template: 'hey {{first_name}}, {{rep_name}} here. still thinking about the {{vehicle}}? happy to answer anything whenever you are ready.', ai_personalize: false },
      { id: 't3s2', sequence_id: 'tpl_3', step_number: 2, delay_days: 5, channel: 'text', message_template: 'hey {{first_name}}, we just got fresh inventory in. worth a quick look while it is here?', ai_personalize: false },
      { id: 't3s3', sequence_id: 'tpl_3', step_number: 3, delay_days: 12, channel: 'call', message_template: 'Re-engagement call. Ask questions, find out what changed since last time. Do not pitch, just reopen the conversation and listen.', ai_personalize: false },
      { id: 't3s4', sequence_id: 'tpl_3', step_number: 4, delay_days: 20, channel: 'text', message_template: 'hey {{first_name}}, anything i can answer for you on the {{vehicle}}? happy to help whenever.', ai_personalize: false },
      { id: 't3s5', sequence_id: 'tpl_3', step_number: 5, delay_days: 30, channel: 'text', message_template: 'hey {{first_name}}, last check-in from me for a bit. you have my number, reach out whenever the timing is right.', ai_personalize: false },
    ],
  },
  // ── LEASE-END UPGRADE (start ~6 months before maturity) ─────────────────────
  {
    id: 'tpl_4',
    name: 'Lease-End Upgrade',
    industry: 'auto',
    description: 'Start the upgrade conversation about six months before lease maturity so they stay in the family.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't4s1', sequence_id: 'tpl_4', step_number: 1, delay_days: 0, channel: 'text', message_template: 'hey {{first_name}}, your lease on the {{vehicle}} should be wrapping up in the next few months. want me to walk you through your options before then?', ai_personalize: false },
      { id: 't4s2', sequence_id: 'tpl_4', step_number: 2, delay_days: 14, channel: 'call', message_template: 'Lease-end call. Talk pull-ahead programs and current equity. Goal is a smooth upgrade so they stay in the family instead of shopping elsewhere.', ai_personalize: false },
      { id: 't4s3', sequence_id: 'tpl_4', step_number: 3, delay_days: 30, channel: 'text', message_template: 'hey {{first_name}}, found a couple options that could fit you nicely for your next one. want me to send a few over?', ai_personalize: false },
      { id: 't4s4', sequence_id: 'tpl_4', step_number: 4, delay_days: 45, channel: 'text', message_template: 'hey {{first_name}}, happy to set up a quick appraisal and lease-end review whenever works. just say the word and i will get it on the calendar.', ai_personalize: false },
    ],
  },
  // ── TRADE-UP EQUITY CHECK (owners 2-4 yrs in / positive equity) ─────────────
  {
    id: 'tpl_5',
    name: 'Trade-Up Equity Check',
    industry: 'auto',
    description: 'Reach owners who likely have positive equity about a payment-neutral upgrade.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't5s1', sequence_id: 'tpl_5', step_number: 1, delay_days: 0, channel: 'text', message_template: 'hey {{first_name}}, the market has been wild and your {{vehicle}} may be worth more than you would guess. want me to pull your current trade equity?', ai_personalize: false },
      { id: 't5s2', sequence_id: 'tpl_5', step_number: 2, delay_days: 7, channel: 'call', message_template: 'Equity call. Run a payment-neutral number: what could they get into for the same monthly. Lead with value, not urgency.', ai_personalize: false },
      { id: 't5s3', sequence_id: 'tpl_5', step_number: 3, delay_days: 21, channel: 'text', message_template: 'hey {{first_name}}, a few of the newer models just landed. if you ever want to see what an upgrade looks like with your equity, i am here.', ai_personalize: false },
    ],
  },
  // ── SERVICE & MAINTENANCE (top-of-mind that seeds the next sale) ────────────
  {
    id: 'tpl_6',
    name: 'Service & Maintenance Reminder',
    industry: 'auto',
    description: 'Stay top of mind with service and seasonal maintenance touches that also seed the next sale.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't6s1', sequence_id: 'tpl_6', step_number: 1, delay_days: 0, channel: 'text', message_template: 'hey {{first_name}}, looks like the {{vehicle}} may be due for service soon. want me to help you get it scheduled?', ai_personalize: false },
      { id: 't6s2', sequence_id: 'tpl_6', step_number: 2, delay_days: 30, channel: 'text', message_template: 'hey {{first_name}}, seasons are changing, good time to check the tires and get everything looked over. let me know if you want me to set it up.', ai_personalize: false },
      { id: 't6s3', sequence_id: 'tpl_6', step_number: 3, delay_days: 90, channel: 'text', message_template: 'hey {{first_name}}, hope the {{vehicle}} is running great. next time you are in for service i would love to say hi, and if you are curious i can show you what your trade equity looks like.', ai_personalize: false },
    ],
  },
  // ── BIRTHDAY & ANNIVERSARY (personal top-of-mind) ───────────────────────────
  {
    id: 'tpl_7',
    name: 'Birthday & Anniversary',
    industry: 'auto',
    description: 'Annual personal touchpoints so you never miss a moment that matters.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't7s1', sequence_id: 'tpl_7', step_number: 1, delay_days: 0, channel: 'text', message_template: 'happy birthday {{first_name}}! hope your day is a great one. {{rep_name}} here, just thinking of you, no agenda at all.', ai_personalize: false },
      { id: 't7s2', sequence_id: 'tpl_7', step_number: 2, delay_days: 1, channel: 'call', message_template: 'Day-after birthday call. Two minutes, ask how the birthday was. No pitch, pure connection. This is what keeps you top of mind.', ai_personalize: false },
    ],
  },
  // ── PAST-CUSTOMER WIN-BACK (long-term top-of-mind) ──────────────────────────
  {
    id: 'tpl_8',
    name: 'Past-Customer Win-Back',
    industry: 'auto',
    description: 'Long-term touches to win back past customers when they are ready for their next vehicle.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't8s1', sequence_id: 'tpl_8', step_number: 1, delay_days: 0, channel: 'text', message_template: 'hey {{first_name}}, hope you and the family are doing great. however your year is going, just know i am still here whenever you need anything.', ai_personalize: false },
      { id: 't8s2', sequence_id: 'tpl_8', step_number: 2, delay_days: 60, channel: 'text', message_template: 'hey {{first_name}}, been a minute! how is the {{vehicle}} holding up? if you are ever thinking about what is next, i would love to help.', ai_personalize: false },
      { id: 't8s3', sequence_id: 'tpl_8', step_number: 3, delay_days: 180, channel: 'text', message_template: 'hey {{first_name}}, we have some great new inventory and i thought of you. if you ever want to take a look, you know where to find me.', ai_personalize: false },
    ],
  },
];

type ScreenView = 'list' | 'detail' | 'create';

interface MassTextRecord {
  id: string;
  message: string;
  recipient_count: number;
  sent_at: string;
}

const EMPTY_STEP = (): Omit<SequenceStep, 'id' | 'sequence_id'> => ({
  step_number: 1,
  delay_days: 0,
  channel: 'text',
  message_template: '',
  ai_personalize: false,
});

export default function SequencesScreen() {
  const [view, setView] = useState<ScreenView>('list');
  const [openSection, setOpenSection] = useState<number | null>(0);
  const [seqSegment, setSeqSegment] = useState<'templates' | 'mine' | 'sent'>('templates');

  const [mySequences, setMySequences] = useState<Sequence[]>([]);
  const [massTexts, setMassTexts] = useState<MassTextRecord[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);

  const [selectedSeq, setSelectedSeq] = useState<Sequence | null>(null);

  // Builder state
  const [bName, setBName] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bIndustry, setBIndustry] = useState('auto');
  const [bSteps, setBSteps] = useState<Array<Omit<SequenceStep, 'id' | 'sequence_id'> & { localId: string }>>([
    { ...EMPTY_STEP(), localId: '1' },
  ]);
  const [saving, setSaving] = useState(false);
  const [userPlan, setUserPlan] = useState<string>('pro');
  const [userId, setUserId] = useState<string | null>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  // Message queue
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queuePos, setQueuePos] = useState(0);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const pendingSendRef = useRef<QueueItem | null>(null);
  const [showConfirmSent, setShowConfirmSent] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // History
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showMassTextModal, setShowMassTextModal] = useState(false);
  const [massMsg, setMassMsg] = useState('');
  const [allContacts, setAllContacts] = useState<{id: string; first_name: string; last_name: string; phone: string}[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState('');

  // Plan limits: Pro=50, Elite=100
  const MASS_LIMIT = userPlan === 'elite' ? 100 : 50;

  useFocusEffect(useCallback(() => {
    loadMySequences();
    loadMassTexts();
    loadQueue();
  }, []));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const nowActive = nextState === 'active';
      if (wasBackground && nowActive && pendingSendRef.current) {
        setShowConfirmSent(true);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  async function loadHistory(uid: string) {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('contact_interactions')
        .select('*')
        .eq('user_id', uid)
        .order('sent_at', { ascending: false })
        .limit(200);
      setHistoryItems(data ?? []);
      setHistoryLoaded(true);
    } catch {
      setHistoryItems([]);
    }
    setHistoryLoading(false);
  }

  async function loadMySequences() {
    setLoadingMy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingMy(false); return; }
      setUserId(user.id);

      const [{ data: prof }, { data: seqs }, { data: ctcts }] = await Promise.all([
        supabase.from('profiles').select('plan,industry').eq('id', user.id).single(),
        supabase.from('sequences').select('*, sequence_steps(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('contacts').select('id,first_name,last_name,phone').eq('user_id', user.id).order('last_name'),
      ]);
      if (prof) {
        setUserPlan(prof.plan ?? 'pro');
        // Auto-first: every template is automotive, so no industry pre-filter.
      }
      setMySequences(seqs ?? []);
      setAllContacts((ctcts ?? []) as any);
    } catch {
      setMySequences([]);
    }
    setLoadingMy(false);
  }

  async function loadQueue() {
    setQueueLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setQueueLoading(false); return; }
      // Check for a saved queue first; if fresh, generate
      const saved = await loadQueueState();
      const today = new Date().toISOString().split('T')[0];
      if (saved && saved.generated_at.startsWith(today)) {
        const pending = saved.items.filter(i => i.status === 'pending' || i.status === 'saved');
        setQueueItems(pending);
        setQueuePos(saved.saved_position);
      } else {
        const { data: prof } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
        const items = await generateQueue(user.id, prof?.plan ?? 'pro');
        setQueueItems(items);
        setQueuePos(0);
        if (items.length > 0) {
          await saveQueueState({ generated_at: new Date().toISOString(), items, saved_position: 0 });
        }
      }
    } catch { setQueueItems([]); }
    setQueueLoading(false);
  }

  async function handleSendItem(item: QueueItem) {
    pendingSendRef.current = item;
    if (item.channel === 'text' && item.phone) {
      const url = `sms:${item.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(editingMessage ?? item.message)}`;
      await Linking.openURL(url).catch(() => {});
      // AppState listener fires when rep returns to app → shows "Did you send it?" banner
    } else {
      // Call/email: confirm immediately (no SMS app transition)
      await confirmSent(item);
    }
  }

  async function confirmSent(item: QueueItem) {
    pendingSendRef.current = null;
    setShowConfirmSent(false);
    if (userId) await markSentAndLog(item, userId);
    const next = queuePos + 1;
    const updatedItems = queueItems.map((q, i) =>
      i === queuePos ? { ...q, status: 'sent' as const } : q
    );
    setQueueItems(updatedItems);
    setEditingMessage(null);
    if (next >= updatedItems.length) {
      await clearQueueState();
      setShowQueueModal(false);
      Alert.alert('All done! 🎉', `Sent ${updatedItems.filter(i => i.status === 'sent').length} messages today.`);
    } else {
      setQueuePos(next);
      await saveQueueState({ generated_at: new Date().toISOString(), items: updatedItems, saved_position: next });
    }
  }

  async function handleSkipItem() {
    const updatedItems = queueItems.map((q, i) =>
      i === queuePos ? { ...q, status: 'skipped' as const } : q
    );
    const next = queuePos + 1;
    setQueueItems(updatedItems);
    setEditingMessage(null);
    if (next >= updatedItems.length) {
      await saveQueueState({ generated_at: new Date().toISOString(), items: updatedItems, saved_position: next });
      setShowQueueModal(false);
    } else {
      setQueuePos(next);
      await saveQueueState({ generated_at: new Date().toISOString(), items: updatedItems, saved_position: next });
    }
  }

  async function handleSaveAndExit() {
    pendingSendRef.current = null;
    setShowConfirmSent(false);
    await saveQueueState({ generated_at: new Date().toISOString(), items: queueItems, saved_position: queuePos });
    setShowQueueModal(false);
  }

  function openMassText() {
    setMassMsg('');
    setSelectedContactIds(new Set());
    setContactSearch('');
    setShowMassTextModal(true);
  }

  function toggleContact(id: string) {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MASS_LIMIT) {
        next.add(id);
      } else {
        Alert.alert(`Limit reached`, `Your ${userPlan === 'elite' ? 'Elite' : 'Pro'} plan allows up to ${MASS_LIMIT} recipients.`);
      }
      return next;
    });
  }

  async function sendMassText() {
    if (!massMsg.trim() || selectedContactIds.size === 0) return;
    const count = selectedContactIds.size;

    Alert.alert('Send Mass Text', `Send to ${count} contact${count !== 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          // Save record to AsyncStorage
          if (AsyncStorage) {
            const record: MassTextRecord = {
              id: Date.now().toString(),
              message: massMsg,
              recipient_count: count,
              sent_at: new Date().toISOString(),
            };
            const existing = massTexts;
            const updated = [...existing, record];
            await AsyncStorage.setItem(MASS_TEXT_KEY, JSON.stringify(updated));
            setMassTexts(updated);
          }
          setShowMassTextModal(false);
          Alert.alert('Queued!', `${count} messages queued for delivery.`);
        },
      },
    ]);
  }

  async function loadMassTexts() {
    if (!AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(MASS_TEXT_KEY);
      if (raw) setMassTexts(JSON.parse(raw));
    } catch {}
  }

  function toggleSection(idx: number) {
    setOpenSection(prev => (prev === idx ? null : idx));
  }

  function openDetail(seq: Sequence) {
    setSelectedSeq(seq);
    setView('detail');
  }

  function openCreate() {
    // All paid plans (Pro and Elite) can create custom sequences
    setBName('');
    setBDesc('');
    setBIndustry('auto');
    setBSteps([{ ...EMPTY_STEP(), localId: Date.now().toString() }]);
    setView('create');
  }

  function addStep() {
    setBSteps(prev => [
      ...prev,
      { ...EMPTY_STEP(), step_number: prev.length + 1, localId: Date.now().toString() },
    ]);
  }

  function removeStep(localId: string) {
    setBSteps(prev => prev.filter(s => s.localId !== localId).map((s, i) => ({ ...s, step_number: i + 1 })));
  }

  function updateStep(localId: string, patch: Partial<Omit<SequenceStep, 'id' | 'sequence_id'>>) {
    setBSteps(prev => prev.map(s => s.localId === localId ? { ...s, ...patch } : s));
  }

  async function saveSequence() {
    if (!bName.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { data: seq, error } = await supabase.from('sequences').insert({
        name: bName.trim(),
        description: bDesc.trim() || null,
        industry: bIndustry,
        user_id: user.id,
        is_template: false,
        is_custom: true,
      }).select().single();

      if (error || !seq) throw new Error('Failed to save sequence');

      const steps = bSteps.map(s => ({
        sequence_id: seq.id,
        step_number: s.step_number,
        delay_days: s.delay_days,
        channel: s.channel,
        message_template: s.message_template,
        ai_personalize: s.ai_personalize,
      }));
      await supabase.from('sequence_steps').insert(steps);

      await loadMySequences();
      setView('list');
    } catch {
      Alert.alert('Saved locally', 'Could not reach the server. Your sequence was not saved.');
    }
    setSaving(false);
  }

  if (view === 'detail' && selectedSeq) {
    return <DetailView seq={selectedSeq} onBack={() => setView('list')} />;
  }

  if (view === 'create') {
    return (
      <View style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setView('list')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.backArrow}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Sequence</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>Name</Text>
          <TextInput
            style={s.fieldInput}
            value={bName}
            onChangeText={setBName}
            placeholder="e.g. 90-Day Follow-Up"
            placeholderTextColor={colors.grey}
          />

          <Text style={s.fieldLabel}>Description</Text>
          <TextInput
            style={[s.fieldInput, { height: 60, textAlignVertical: 'top' }]}
            value={bDesc}
            onChangeText={setBDesc}
            placeholder="What is this sequence for?"
            placeholderTextColor={colors.grey}
            multiline
          />

          <Text style={s.fieldLabel}>Industry</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {INDUSTRIES.map(ind => (
                <TouchableOpacity
                  key={ind}
                  style={[s.industryPill, bIndustry === ind && s.industryPillActive]}
                  onPress={() => setBIndustry(ind)}
                >
                  <Text style={[s.industryPillText, bIndustry === ind && s.industryPillTextActive]}>
                    {ind}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[s.fieldLabel, { marginBottom: spacing.sm }]}>Steps</Text>
          {bSteps.map((step, idx) => (
            <View key={step.localId} style={s.stepCard}>
              <View style={s.stepCardHeader}>
                <Text style={s.stepNum}>Step {idx + 1}</Text>
                {bSteps.length > 1 && (
                  <TouchableOpacity onPress={() => removeStep(step.localId)}>
                    <Text style={s.removeStep}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={s.stepFieldLabel}>Channel</Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
                {(['text', 'call', 'email'] as const).map(ch => (
                  <TouchableOpacity
                    key={ch}
                    style={[s.channelPill, step.channel === ch && s.channelPillActive]}
                    onPress={() => updateStep(step.localId, { channel: ch })}
                  >
                    <Text style={[s.channelPillText, step.channel === ch && s.channelPillTextActive]}>
                      {CHANNEL_ICON[ch]} {ch}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.stepFieldLabel}>Send on Day</Text>
              <TextInput
                style={s.stepInput}
                value={step.delay_days.toString()}
                onChangeText={v => updateStep(step.localId, { delay_days: parseInt(v) || 0 })}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.grey}
              />

              <Text style={s.stepFieldLabel}>Message Template</Text>
              <TextInput
                style={[s.stepInput, { height: 70, textAlignVertical: 'top' }]}
                value={step.message_template}
                onChangeText={v => updateStep(step.localId, { message_template: v })}
                placeholder="Use {{first_name}} for personalization"
                placeholderTextColor={colors.grey}
                multiline
              />

              <View style={s.aiRow}>
                <Text style={s.stepFieldLabel}>AI Personalize</Text>
                <Switch
                  value={step.ai_personalize}
                  onValueChange={v => updateStep(step.localId, { ai_personalize: v })}
                  trackColor={{ false: colors.ink4, true: colors.gold }}
                  thumbColor={step.ai_personalize ? colors.ink : colors.grey2}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addStepBtn} onPress={addStep}>
            <Text style={s.addStepBtnText}>+ Add Step</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.saveBtn} onPress={saveSequence} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={s.saveBtnText}>Save Sequence</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.logoMark}>
          <Text style={s.logoMarkText}>P</Text>
        </View>
        <Text style={s.headerTitle}>Sequences</Text>
        <TouchableOpacity style={s.massTextBtn} onPress={openMassText} activeOpacity={0.8}>
          <Text style={s.massTextBtnText}>📤 Mass Text</Text>
        </TouchableOpacity>
      </View>

      {/* Ready to Send banner — always visible when queue has items */}
      {queueLoading ? null : queueItems.length > 0 ? (
        <View style={sq.card}>
          <View style={sq.cardTop}>
            <Text style={sq.cardCount}>{queueItems.length} message{queueItems.length !== 1 ? 's' : ''} ready to send</Text>
            <Text style={sq.cardSub}>Oldest due: {queueItems[0]?.due_date} · Est. {Math.ceil(queueItems.length * 0.5)} min</Text>
          </View>
          {userPlan === 'pro' && queueItems.length === 50 && (
            <Text style={sq.limitNote}>Showing 50 (Pro limit) · Upgrade to Elite for 100/batch</Text>
          )}
          <View style={sq.cardBtns}>
            <TouchableOpacity style={sq.startBtn} onPress={() => { setQueuePos(0); setShowQueueModal(true); }} activeOpacity={0.85}>
              <Text style={sq.startBtnText}>▶ Start Sending</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sq.saveBtn} onPress={handleSaveAndExit} activeOpacity={0.8}>
              <Text style={sq.saveBtnText}>💾 Save for Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* 3-segment tab bar */}
      <View style={s.segBar}>
        {([
          { key: 'templates', label: '📋 Templates' },
          { key: 'mine', label: '⚡ Mine' },
          { key: 'sent', label: '📜 Sent' },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.segTab, seqSegment === tab.key && s.segTabActive]}
            onPress={() => {
              setSeqSegment(tab.key);
              if (tab.key === 'sent' && userId && !historyLoaded) loadHistory(userId);
            }}
            activeOpacity={0.8}
          >
            <Text style={[s.segTabText, seqSegment === tab.key && s.segTabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Templates tab */}
        {seqSegment === 'templates' && (
          <>
            <View style={mt.industrySubtitleRow}>
              <Text style={mt.industrySubtitleText}>
                {templateFilter === 'all'
                  ? 'All templates'
                  : `Showing: ${INDUSTRY_CONFIG[templateFilter]?.icon ?? ''} ${INDUSTRY_CONFIG[templateFilter]?.label ?? templateFilter}`}
              </Text>
              {templateFilter !== 'all' && (
                <TouchableOpacity onPress={() => setTemplateFilter('all')} activeOpacity={0.7}>
                  <Text style={mt.viewAllLink}> · View All ↗</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.bubbleGrid}>
              {TEMPLATES.filter(t => templateFilter === 'all' || t.industry === templateFilter).map(seq => (
                <SequenceBubble key={seq.id} seq={seq} onPress={() => openDetail(seq)} />
              ))}
            </View>
          </>
        )}

        {/* My Sequences tab */}
        {seqSegment === 'mine' && (
          loadingMy ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.bubbleGrid}>
              {mySequences.map(seq => (
                <SequenceBubble key={seq.id} seq={seq} onPress={() => openDetail(seq)} />
              ))}
              <TouchableOpacity style={s.newBubble} onPress={openCreate} activeOpacity={0.8}>
                <Text style={s.newBubbleIcon}>+</Text>
                <Text style={s.newBubbleText}>New Sequence</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Sent tab */}
        {seqSegment === 'sent' && (
          historyLoading ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
          ) : historyItems.length === 0 ? (
            <View style={s.emptySection}>
              <Text style={s.emptySectionText}>No sent messages yet. Start sending from your queue!</Text>
            </View>
          ) : (() => {
            const groups: Record<string, any[]> = {};
            for (const item of historyItems) {
              const day = (item.sent_at ?? '').split('T')[0];
              if (!groups[day]) groups[day] = [];
              groups[day].push(item);
            }
            return (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                {Object.entries(groups).map(([day, items]) => (
                  <View key={day}>
                    <Text style={s.historyDateHeader}>{day}</Text>
                    {items.map((h: any) => (
                      <View key={h.id} style={s.historyRow}>
                        <Text style={s.historyChannel}>{CHANNEL_ICON[h.channel] ?? '📨'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.historyContact} numberOfLines={1}>{h.contact_name ?? 'Unknown'}</Text>
                          <Text style={s.historyMsg} numberOfLines={2}>{(h.message ?? '').slice(0, 80)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          })()
        )}
      </ScrollView>

      {/* Send Queue Modal */}
      <Modal visible={showQueueModal} animationType="slide">
        <View style={sq.modal}>
          {/* Header */}
          <View style={sq.modalHeader}>
            <TouchableOpacity onPress={handleSaveAndExit} activeOpacity={0.8}>
              <Text style={sq.exitBtn}>← Save & Exit</Text>
            </TouchableOpacity>
            <Text style={sq.posLabel}>{queuePos + 1} of {queueItems.length}</Text>
          </View>
          {/* Progress bar */}
          <View style={sq.progressTrack}>
            <View style={[sq.progressFill, { width: `${((queuePos + 1) / Math.max(queueItems.length, 1)) * 100}%` as any }]} />
          </View>

          {/* "Did you send it?" confirmation banner */}
          {showConfirmSent && pendingSendRef.current && (
            <View style={sq.confirmBanner}>
              <Text style={sq.confirmText}>Did you send it?</Text>
              <View style={sq.confirmRow}>
                <TouchableOpacity
                  style={sq.confirmYes}
                  onPress={() => confirmSent(pendingSendRef.current!)}
                  activeOpacity={0.85}
                >
                  <Text style={sq.confirmYesText}>✅ Yes, sent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sq.confirmNo}
                  onPress={() => { pendingSendRef.current = null; setShowConfirmSent(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={sq.confirmNoText}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {queueItems[queuePos] ? (() => {
            const item = queueItems[queuePos];
            const initials = item.contact_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return (
              <ScrollView contentContainerStyle={sq.modalBody} keyboardShouldPersistTaps="handled">
                {/* Contact info */}
                <View style={sq.contactRow}>
                  <View style={sq.avatar}><Text style={sq.avatarText}>{initials}</Text></View>
                  <View>
                    <Text style={sq.contactName}>{item.contact_name}</Text>
                    <Text style={sq.contactPhone}>{item.phone || 'No phone'}</Text>
                    <Text style={sq.dueDate}>Due: {item.due_date} · {CHANNEL_ICON[item.channel]}</Text>
                  </View>
                </View>

                {/* Message preview / edit */}
                <TextInput
                  style={sq.msgBox}
                  value={editingMessage ?? item.message}
                  onChangeText={setEditingMessage}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />

                {/* Actions */}
                {item.channel === 'text' ? (
                  <TouchableOpacity
                    style={[sq.openSmsBtn, !item.phone && { opacity: 0.4 }]}
                    onPress={() => handleSendItem(item)}
                    disabled={!item.phone}
                    activeOpacity={0.85}
                  >
                    <Text style={sq.openSmsBtnText}>📱 Open in Messages →</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={sq.openSmsBtn} onPress={() => handleSendItem(item)} activeOpacity={0.85}>
                    <Text style={sq.openSmsBtnText}>{item.channel === 'call' ? '📞 Mark Call Done →' : '📧 Mark Email Done →'}</Text>
                  </TouchableOpacity>
                )}

                <View style={sq.secondaryBtns}>
                  <TouchableOpacity style={sq.editBtn} onPress={() => setEditingMessage(editingMessage === null ? item.message : null)} activeOpacity={0.8}>
                    <Text style={sq.editBtnText}>{editingMessage !== null ? '↩ Reset' : '✏️ Edit'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={sq.skipBtn} onPress={handleSkipItem} activeOpacity={0.8}>
                    <Text style={sq.skipBtnText}>⏭ Skip</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            );
          })() : (
            <View style={sq.allDone}>
              <Text style={sq.allDoneIcon}>🎉</Text>
              <Text style={sq.allDoneTitle}>All done!</Text>
              <Text style={sq.allDoneSub}>Queue complete. Great work.</Text>
              <TouchableOpacity style={sq.openSmsBtn} onPress={() => setShowQueueModal(false)} activeOpacity={0.85}>
                <Text style={sq.openSmsBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Mass Text Modal */}
      <Modal visible={showMassTextModal} animationType="slide" transparent>
        <View style={mt.overlay}>
          <View style={mt.sheet}>
            <View style={mt.handle} />
            <View style={mt.header}>
              <Text style={mt.title}>Mass Text</Text>
              <TouchableOpacity onPress={() => setShowMassTextModal(false)}>
                <Text style={mt.close}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Plan limit badge */}
            <View style={mt.limitRow}>
              <Text style={mt.limitText}>
                {selectedContactIds.size} / {MASS_LIMIT} selected
              </Text>
              <View style={mt.planBadge}>
                <Text style={mt.planBadgeText}>{userPlan === 'elite' ? 'ELITE' : 'PRO'}</Text>
              </View>
            </View>

            {/* Contact search + picker */}
            <TextInput
              style={mt.input}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contacts…"
              placeholderTextColor={colors.grey}
            />

            <ScrollView style={mt.contactList} keyboardShouldPersistTaps="handled">
              {allContacts
                .filter(c => {
                  const q = contactSearch.toLowerCase();
                  return !q || `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || c.phone?.includes(q);
                })
                .map(c => {
                  const selected = selectedContactIds.has(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[mt.contactRow, selected && mt.contactRowSelected]}
                      onPress={() => toggleContact(c.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[mt.checkbox, selected && mt.checkboxChecked]}>
                        {selected && <Text style={mt.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={mt.contactName}>{c.first_name} {c.last_name}</Text>
                        {c.phone ? <Text style={mt.contactPhone}>{c.phone}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* Message */}
            <TextInput
              style={[mt.input, { height: 90, textAlignVertical: 'top', marginTop: spacing.sm }]}
              value={massMsg}
              onChangeText={setMassMsg}
              placeholder="Hey {{first_name}}, …"
              placeholderTextColor={colors.grey}
              multiline
            />
            <Text style={mt.tip}>Use {'{{first_name}}'} for personalization.</Text>

            <TouchableOpacity
              style={[mt.sendBtn, (!massMsg.trim() || selectedContactIds.size === 0) && { opacity: 0.4 }]}
              disabled={!massMsg.trim() || selectedContactIds.size === 0}
              onPress={sendMassText}
              activeOpacity={0.85}
            >
              <Text style={mt.sendBtnText}>
                Send to {selectedContactIds.size} contact{selectedContactIds.size !== 1 ? 's' : ''} →
              </Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AccordionSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <TouchableOpacity style={s.sectionHeader} onPress={onToggle} activeOpacity={0.8}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && <View style={s.sectionBody}>{children}</View>}
    </View>
  );
}

function SequenceBubble({ seq, onPress }: { seq: Sequence; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.bubble} onPress={onPress} activeOpacity={0.8}>
      <View style={s.bubbleTop}>
        <View style={s.industryBadge}>
          <Text style={s.industryBadgeText}>{seq.industry}</Text>
        </View>
        <Text style={s.bubbleSteps}>{seq.sequence_steps?.length ?? 0} steps</Text>
      </View>
      <Text style={s.bubbleName} numberOfLines={2}>{seq.name}</Text>
      <Text style={s.bubbleDesc} numberOfLines={2}>{seq.description}</Text>
    </TouchableOpacity>
  );
}

function DetailView({ seq, onBack }: { seq: Sequence; onBack: () => void }) {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{seq.name}</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={s.detailMeta}>
          <View style={s.industryBadge}>
            <Text style={s.industryBadgeText}>{seq.industry}</Text>
          </View>
          {seq.is_template && (
            <View style={s.templateBadge}>
              <Text style={s.templateBadgeText}>Template</Text>
            </View>
          )}
        </View>
        {seq.description ? <Text style={s.detailDesc}>{seq.description}</Text> : null}

        <Text style={s.stepsTitle}>Steps</Text>
        {(seq.sequence_steps ?? []).sort((a, b) => a.step_number - b.step_number).map(step => (
          <View key={step.id} style={s.stepRow}>
            <View style={s.stepRowLeft}>
              <Text style={s.stepRowIcon}>{CHANNEL_ICON[step.channel]}</Text>
              <View>
                <Text style={s.stepRowLabel}>Step {step.step_number} · Day {step.delay_days}</Text>
                <Text style={s.stepRowChannel}>{step.channel}</Text>
              </View>
            </View>
            <Text style={s.stepRowMsg} numberOfLines={3}>{step.message_template}</Text>
          </View>
        ))}

        <TouchableOpacity
          style={s.assignBtn}
          onPress={() => Alert.alert('Assign to Contact', 'Contact search coming soon. For now, open a contact and assign from their profile.')}
          activeOpacity={0.85}
        >
          <Text style={s.assignBtnText}>Assign to Contact</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  logoMark: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  logoMarkText: { color: colors.ink, fontWeight: '900', fontSize: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  backArrow: { color: colors.gold, fontSize: 14, fontWeight: '600' },
  massTextBtn: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  massTextBtnText: { color: colors.gold, fontSize: 11, fontWeight: '700' },

  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ink4,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  sectionChevron: { color: colors.grey2, fontSize: 11 },
  sectionBody: { paddingBottom: spacing.md },

  bubbleScroll: { paddingHorizontal: spacing.md, paddingBottom: 4, gap: spacing.sm, flexDirection: 'row' },
  bubbleGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  segBar: {
    flexDirection: 'row', backgroundColor: colors.ink2,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  segTab: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  segTabActive: { borderBottomColor: colors.gold },
  segTabText: { fontSize: 12, fontWeight: '600', color: colors.grey2 },
  segTabTextActive: { color: colors.gold, fontWeight: '700' },

  bubble: {
    width: (screenWidth - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: colors.ink3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink4,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bubbleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  bubbleName: { fontSize: 13, fontWeight: '700', color: colors.white },
  bubbleDesc: { fontSize: 11, color: colors.grey2, lineHeight: 16 },
  bubbleSteps: { fontSize: 10, color: colors.grey, fontWeight: '600' },

  industryBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  industryBadgeText: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.5, textTransform: 'uppercase' },

  newBubble: {
    width: (screenWidth - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  newBubbleIcon: { fontSize: 24, color: colors.ink, fontWeight: '800' },
  newBubbleText: { fontSize: 12, fontWeight: '700', color: colors.ink },

  massBubble: {
    width: screenWidth * 0.55,
    backgroundColor: colors.ink3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink4,
    padding: spacing.md,
    gap: spacing.xs,
  },
  massBubbleDate: { fontSize: 10, color: colors.gold, fontWeight: '600' },
  massBubbleCount: { fontSize: 11, fontWeight: '700', color: colors.white },
  massBubbleMsg: { fontSize: 11, color: colors.grey2, lineHeight: 16 },

  emptySection: { padding: spacing.lg, alignItems: 'center' },
  emptySectionText: { color: colors.grey, fontSize: 13 },

  // History
  historyDateHeader: {
    fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  historyChannel: { fontSize: 18, lineHeight: 22 },
  historyContact: { fontSize: 12, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  historyMsg: { fontSize: 11, color: colors.grey2, lineHeight: 16 },

  // Detail
  detailMeta: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  templateBadge: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  templateBadgeText: { fontSize: 9, fontWeight: '700', color: colors.grey3, letterSpacing: 0.5 },
  detailDesc: { fontSize: 13, color: colors.grey2, lineHeight: 19, marginBottom: spacing.lg },
  stepsTitle: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.md },
  stepRow: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  stepRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  stepRowIcon: { fontSize: 18 },
  stepRowLabel: { fontSize: 12, fontWeight: '700', color: colors.white },
  stepRowChannel: { fontSize: 10, color: colors.grey2, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepRowMsg: { fontSize: 12, color: colors.grey3, lineHeight: 18 },
  assignBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl,
  },
  assignBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },

  // Builder
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.grey3, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 4 },
  fieldInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.sm + 2, color: colors.white, fontSize: 14, marginBottom: spacing.sm,
  },
  industryPill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  industryPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  industryPillText: { color: colors.grey2, fontSize: 12, fontWeight: '600' },
  industryPillTextActive: { color: colors.gold },
  stepCard: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4,
    padding: spacing.md, marginBottom: spacing.md,
  },
  stepCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  stepNum: { fontSize: 12, fontWeight: '700', color: colors.gold },
  removeStep: { color: colors.grey, fontSize: 14 },
  stepFieldLabel: { fontSize: 10, fontWeight: '600', color: colors.grey3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  stepInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.sm, color: colors.white, fontSize: 13, marginBottom: spacing.sm,
  },
  channelPill: {
    borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  channelPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  channelPillText: { color: colors.grey2, fontSize: 12 },
  channelPillTextActive: { color: colors.gold, fontWeight: '700' },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  addStepBtn: {
    borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, borderStyle: 'dashed',
    padding: spacing.md, alignItems: 'center', marginBottom: spacing.lg,
  },
  addStepBtnText: { color: colors.gold, fontWeight: '600', fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

const mt = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, paddingBottom: 36, maxHeight: '88%',
  },
  handle: { width: 36, height: 4, backgroundColor: colors.ink4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: 17, fontWeight: '800', color: colors.white },
  close: { color: colors.grey2, fontSize: 18 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  limitText: { fontSize: 12, color: colors.grey3, fontWeight: '600' },
  planBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  planBadgeText: { color: colors.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.sm + 2, color: colors.white, fontSize: 14,
    marginBottom: 4,
  },
  contactList: { maxHeight: 200, marginBottom: spacing.sm },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, borderRadius: radius.md, marginBottom: 2,
  },
  contactRowSelected: { backgroundColor: colors.goldBg },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkmark: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  contactName: { fontSize: 13, fontWeight: '600', color: colors.white },
  contactPhone: { fontSize: 11, color: colors.grey2 },
  tip: { fontSize: 11, color: colors.grey, marginBottom: spacing.md },
  sendBtn: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  sendBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  // Industry subtitle row (replaces filter pills)
  industrySubtitleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  industrySubtitleText: { color: colors.grey2, fontSize: 12 },
  viewAllLink: { color: colors.gold, fontSize: 12, fontWeight: '600' },
});

// ── Queue / Ready-to-Send styles ─────────────────────────────────────────────
const sq = StyleSheet.create({
  // Queue status card
  card: {
    margin: spacing.lg, marginTop: 0,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.md,
  },
  cardTop: { marginBottom: spacing.sm },
  cardCount: { fontSize: 15, fontWeight: '800', color: colors.white },
  cardSub: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  limitNote: { fontSize: 11, color: colors.orange, marginBottom: spacing.sm },
  cardBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  startBtn: { flex: 2, backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  startBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  saveBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 12 },
  // Full-screen modal
  modal: { flex: 1, backgroundColor: colors.ink },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  exitBtn: { color: colors.grey2, fontSize: 14, fontWeight: '600' },
  posLabel: { color: colors.grey, fontSize: 13 },
  progressTrack: { height: 3, backgroundColor: colors.ink4 },
  progressFill: { height: 3, backgroundColor: colors.gold },
  modalBody: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  // Contact info
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.goldBg, borderWidth: 1.5, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  contactName: { fontSize: 16, fontWeight: '800', color: colors.white },
  contactPhone: { fontSize: 13, color: colors.grey2, marginTop: 2 },
  dueDate: { fontSize: 11, color: colors.grey, marginTop: 2 },
  // Message box
  msgBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.md, color: colors.white,
    fontSize: 14, lineHeight: 22, minHeight: 120,
  },
  // Buttons
  openSmsBtn: { backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md + 2, alignItems: 'center' },
  openSmsBtnText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  secondaryBtns: { flexDirection: 'row', gap: spacing.sm },
  editBtn: { flex: 1, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  editBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 13 },
  skipBtn: { flex: 1, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  skipBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 13 },
  // All done
  allDone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  allDoneIcon: { fontSize: 56 },
  allDoneTitle: { fontSize: 24, fontWeight: '800', color: colors.white },
  allDoneSub: { fontSize: 14, color: colors.grey2 },
  // "Did you send it?" confirmation banner
  confirmBanner: {
    backgroundColor: '#1a2a1a', borderBottomWidth: 1, borderBottomColor: '#2a4a2a',
    padding: spacing.lg, gap: spacing.sm,
  },
  confirmText: { fontSize: 16, fontWeight: '800', color: colors.white, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmYes: { flex: 1, backgroundColor: '#22c55e', borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  confirmYesText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  confirmNo: { flex: 1, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  confirmNoText: { color: colors.grey2, fontWeight: '600', fontSize: 15 },
});
