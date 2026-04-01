import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Dimensions, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Sequence, SequenceStep } from '@/lib/types';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

const MASS_TEXT_KEY = 'pocketrep_mass_text_v1';
const { width: screenWidth } = Dimensions.get('window');

const CHANNEL_ICON: Record<string, string> = { text: '💬', call: '📞', email: '📧' };
const INDUSTRIES = ['auto', 'mortgage', 'realestate', 'insurance', 'solar', 'b2b'];

const TEMPLATES: Sequence[] = [
  {
    id: 'tpl_1',
    name: 'Last Month Sold Customer',
    industry: 'auto',
    description: 'Re-engage customers sold in the past 30 days.',
    user_id: null,
    is_template: true,
    is_custom: false,
    created_at: '',
    sequence_steps: [
      { id: 's1', sequence_id: 'tpl_1', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, just checking in — how are you loving your new ride?', ai_personalize: false },
      { id: 's2', sequence_id: 'tpl_1', step_number: 2, delay_days: 7, channel: 'text', message_template: 'Hi {{first_name}}! Any questions about your vehicle so far? I\'m here if you need anything.', ai_personalize: false },
      { id: 's3', sequence_id: 'tpl_1', step_number: 3, delay_days: 21, channel: 'call', message_template: 'Call to check satisfaction and ask for referrals.', ai_personalize: false },
      { id: 's4', sequence_id: 'tpl_1', step_number: 4, delay_days: 45, channel: 'text', message_template: 'Hey {{first_name}}, hope everything\'s going great! If you know anyone looking for a vehicle, I\'d love to help them out.', ai_personalize: false },
      { id: 's5', sequence_id: 'tpl_1', step_number: 5, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}! Coming up on 90 days — how\'s the {{vehicle}} treating you?', ai_personalize: false },
    ],
  },
  {
    id: 'tpl_2',
    name: 'Rate Drop Alert',
    industry: 'mortgage',
    description: 'Notify leads when rates drop to re-engage fence-sitters.',
    user_id: null,
    is_template: true,
    is_custom: false,
    created_at: '',
    sequence_steps: [
      { id: 's6', sequence_id: 'tpl_2', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, rates just dropped — this could save you significantly on your monthly payment. Want to run numbers?', ai_personalize: false },
      { id: 's7', sequence_id: 'tpl_2', step_number: 2, delay_days: 2, channel: 'call', message_template: 'Follow-up call to discuss rate drop impact on their specific scenario.', ai_personalize: false },
      { id: 's8', sequence_id: 'tpl_2', step_number: 3, delay_days: 5, channel: 'email', message_template: 'Hi {{first_name}}, sending over a personalized rate comparison for your situation. Let me know if you have questions!', ai_personalize: false },
    ],
  },
  {
    id: 'tpl_3',
    name: 'Homeowner Equity Check',
    industry: 'realestate',
    description: 'Touch base with homeowners about their equity position.',
    user_id: null,
    is_template: true,
    is_custom: false,
    created_at: '',
    sequence_steps: [
      { id: 's9', sequence_id: 'tpl_3', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, homes in your area are selling fast. Have you thought about what your equity looks like right now?', ai_personalize: false },
      { id: 's10', sequence_id: 'tpl_3', step_number: 2, delay_days: 3, channel: 'call', message_template: 'Call to discuss current market conditions and equity estimate.', ai_personalize: false },
      { id: 's11', sequence_id: 'tpl_3', step_number: 3, delay_days: 10, channel: 'email', message_template: 'Hi {{first_name}}, I ran a quick market analysis on homes near yours — attached is what I found. Happy to chat!', ai_personalize: false },
      { id: 's12', sequence_id: 'tpl_3', step_number: 4, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, just checking back in. The market\'s still moving — let me know if you want an updated number.', ai_personalize: false },
    ],
  },
];

type View = 'list' | 'detail' | 'create';

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
  const [view, setView] = useState<View>('list');
  const [openSection, setOpenSection] = useState<number | null>(0);

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
  }, []));

  async function loadMySequences() {
    setLoadingMy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingMy(false); return; }

      const { data: prof } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
      if (prof) setUserPlan(prof.plan);

      const { data } = await supabase
        .from('sequences')
        .select('*, sequence_steps(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setMySequences(data ?? []);
    } catch {
      setMySequences([]);
    }
    setLoadingMy(false);
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
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Section: Templates */}
        <AccordionSection
          title="📋 Templates"
          open={openSection === 0}
          onToggle={() => toggleSection(0)}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleScroll}>
            {TEMPLATES.map(seq => (
              <SequenceBubble key={seq.id} seq={seq} onPress={() => openDetail(seq)} />
            ))}
          </ScrollView>
        </AccordionSection>

        {/* Section: My Sequences */}
        <AccordionSection
          title="⚡ My Sequences"
          open={openSection === 1}
          onToggle={() => toggleSection(1)}
        >
          {loadingMy ? (
            <ActivityIndicator color={colors.gold} style={{ margin: spacing.lg }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleScroll}>
              {mySequences.map(seq => (
                <SequenceBubble key={seq.id} seq={seq} onPress={() => openDetail(seq)} />
              ))}
              <TouchableOpacity style={s.newBubble} onPress={openCreate} activeOpacity={0.8}>
                <Text style={s.newBubbleIcon}>+</Text>
                <Text style={s.newBubbleText}>New Sequence</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </AccordionSection>

        {/* Section: Recent Mass Texts */}
        <AccordionSection
          title="📱 Recent Mass Texts"
          open={openSection === 2}
          onToggle={() => toggleSection(2)}
        >
          {massTexts.length === 0 ? (
            <View style={s.emptySection}>
              <Text style={s.emptySectionText}>No mass texts yet</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleScroll}>
              {massTexts.slice().reverse().map(mt => (
                <View key={mt.id} style={s.massBubble}>
                  <Text style={s.massBubbleDate}>{new Date(mt.sent_at).toLocaleDateString()}</Text>
                  <Text style={s.massBubbleCount}>{mt.recipient_count} recipients</Text>
                  <Text style={s.massBubbleMsg} numberOfLines={3}>{mt.message}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </AccordionSection>
      </ScrollView>
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

  bubble: {
    width: screenWidth * 0.6,
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
    width: screenWidth * 0.4,
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
