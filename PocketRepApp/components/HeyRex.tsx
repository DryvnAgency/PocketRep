import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Modal, ScrollView, ActivityIndicator,
  Pressable, Alert, Platform, TextInput,
} from 'react-native';
import { Audio } from 'expo-av';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import { scheduleContactReminders, requestNotificationPermission, type PersonalEvent } from '@/lib/notifications';
import { INDUSTRY_CONFIG } from '@/lib/industryConfig';

// ── Hey Rex — Voice Intake Engine ────────────────────────────────────────────
// Workflow:
//   1. Rep taps the gold mic orb (or long-presses for hands-free)
//   2. Talks after a meeting: "Marcus Webb, interested in F-150 XLT, not the
//      Raptor — too expensive. Busy this week. Send pricing Friday. Call Monday."
//   3. Whisper transcribes the audio
//   4. Rex (Haiku) parses it into: contact match, notes, follow-up date, game plan
//   5. Notes + follow-up saved to the matching contact in their book
//   6. Rex returns a deal game plan on how to move it forward
//
// True hands-free wake word ("Hey Rex" with no tap):
//   → Add @picovoice/porcupine-react-native + custom "Hey Rex" keyword
//   → picovoice.ai/console — free tier, runs fully on-device, no battery drain

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY ?? '';
const AI_PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL ?? 'https://api.anthropic.com';
const REX_MODEL = 'claude-haiku-4-5-20251001';

type Stage = 'idle' | 'listening' | 'processing' | 'done';

interface ParsedIntake {
  customer_name: string;
  contact_id: string | null;
  phone: string | null;
  interests: string;
  objections: string;
  follow_up_in_days: number | null;
  follow_up_note: string;
  updated_notes: string;
  game_plan: string;
  // New fields for Pocket Wrap
  vehicle_interest: string | null;
  lease_end_date: string | null;   // ISO 'YYYY-MM-DD'
  personal_events: PersonalEvent[];
  buying_urgency: 'low' | 'medium' | 'high';
}

interface GeneratedStep {
  delay_days: number;
  channel: 'text' | 'call' | 'email';
  message: string;
}

const isWeb = Platform.OS === 'web';

export default function HeyRex() {
  const [stage, setStage] = useState<Stage>('idle');
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedIntake | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [webInput, setWebInput] = useState('');
  const [userIndustry, setUserIndustry] = useState<string>('auto');
  const [saved, setSaved] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<GeneratedStep[]>([]);
  const [sequenceExpanded, setSequenceExpanded] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const [generatingSeq, setGeneratingSeq] = useState(false);
  const recording = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();
  const segments = useSegments();
  // Hide the orb when already on the Rex tab
  const onRexTab = segments[segments.length - 1] === 'rex';

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('industry').eq('id', user.id).single().then(({ data }) => {
        if (data?.industry) setUserIndustry(data.industry);
      });
    });
  }, []);

  useEffect(() => {
    if (stage === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 550, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    }
  }, [stage]);

  async function startListening() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Mic needed', 'Allow microphone access to use Hey Rex.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recording.current = rec;

      setStage('listening');
      setShowSheet(true);
      setTranscript('');
      setParsed(null);
      setSaved(false);

      // Auto-stop at 30 seconds
      setTimeout(() => { if (recording.current) stopListening(); }, 30000);
    } catch (e) {
      console.warn('Hey Rex start error:', e);
      Alert.alert('Hey Rex', "Couldn't start recording. Check mic permissions in Settings.");
    }
  }

  async function stopListening() {
    if (!recording.current || stage !== 'listening') return;
    setStage('processing');

    try {
      await recording.current.stopAndUnloadAsync();
      const uri = recording.current.getURI();
      recording.current = null;

      // Always restore audio mode so the rest of the app works normally
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
      });

      if (!uri) { setStage('idle'); return; }

      // ── Step 1: Transcribe via Whisper ─────────────────────────────────────
      let voiceText = '';
      if (OPENAI_KEY) {
        // Fetch the file as a blob — more reliable than object literal on both
        // iOS (file://) and Android (content://) URIs
        const audioBlob = await fetch(uri).then(r => r.blob());
        const form = new FormData();
        form.append('file', audioBlob, 'intake.m4a');
        form.append('model', 'whisper-1');
        const wr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_KEY}` },
          body: form,
        });
        const wj = await wr.json();
        voiceText = wj.text ?? '';
      } else {
        voiceText = '[No OPENAI_KEY — add EXPO_PUBLIC_OPENAI_KEY to .env for transcription]';
      }

      setTranscript(voiceText);
      if (!voiceText.trim() || voiceText.startsWith('[')) {
        // Still parse with a demo prompt so the UI shows what Rex would do
      }

      // ── Step 2: Load contacts for name matching ────────────────────────────
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStage('idle'); return; }

      const { data: contacts } = await supabase
        .from('contacts')
        .select('id,first_name,last_name,notes,phone,vehicle_make,vehicle_model')
        .eq('user_id', user.id);

      const contactList = (contacts ?? [])
        .map((c: any) => `${c.first_name} ${c.last_name} (id:${c.id})`)
        .join(', ') || 'No contacts yet';

      // ── Step 3: Rex parses transcript into structured intake ───────────────
      if (!ANTHROPIC_KEY) {
        setParsed({
          customer_name: 'Add ANTHROPIC_KEY to activate',
          contact_id: null,
          phone: null,
          interests: voiceText,
          objections: '',
          follow_up_in_days: null,
          follow_up_note: '',
          updated_notes: voiceText,
          game_plan: 'Add your Anthropic API key to .env to get Rex\'s full game plan.',
          vehicle_interest: null,
          lease_end_date: null,
          personal_events: [],
          buying_urgency: 'medium',
        });
        setStage('done');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const industryLabel = INDUSTRY_CONFIG[userIndustry]?.label ?? 'Sales';
      const systemPrompt = `
You are Rex, a sales intake AI for a ${industryLabel} rep. The rep just gave you a voice memo after a customer meeting.
Your job: extract ALL key info and return a JSON object ONLY — no other text, no markdown.

Today's date: ${today}
Industry: ${industryLabel} — tailor the game_plan and follow-up language to this industry.
Contacts in their book: ${contactList}

Return this exact JSON shape:
{
  "customer_name": "Full name mentioned",
  "contact_id": "the id from the contacts list if name matches, or null",
  "phone": "phone number mentioned or null",
  "interests": "what they want / are interested in (vehicle, product, etc)",
  "objections": "objections or hesitations mentioned",
  "follow_up_in_days": number or null,
  "follow_up_note": "brief reminder of what to say/do on follow-up",
  "updated_notes": "2-4 sentences of clean notes, present tense, no filler",
  "game_plan": "2-3 sentence game plan — specific angle, what to lead with next call, one risk to avoid",
  "vehicle_interest": "specific vehicle they are interested in buying, or null",
  "lease_end_date": "YYYY-MM-DD if a lease end / contract end date is mentioned, or null",
  "personal_events": [{ "type": "baby_due|anniversary|birthday|other", "date": "YYYY-MM-DD" }],
  "buying_urgency": "low|medium|high based on timeline and intent signals"
}
`.trim();

      const rr = await fetch(`${AI_PROXY_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: REX_MODEL,
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: voiceText }],
        }),
      });

      const rj = await rr.json();
      const raw = rj.content?.[0]?.text ?? '{}';

      let intake: ParsedIntake;
      try {
        intake = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      } catch {
        intake = {
          customer_name: 'Unknown',
          contact_id: null,
          phone: null,
          interests: voiceText,
          objections: '',
          follow_up_in_days: null,
          follow_up_note: '',
          updated_notes: voiceText,
          game_plan: "Rex couldn't fully parse that — tap 'Save anyway' to keep the raw transcript.",
          vehicle_interest: null,
          lease_end_date: null,
          personal_events: [],
          buying_urgency: 'medium',
        };
      }

      setParsed(intake);
      setStage('done');

    } catch (e) {
      console.warn('Hey Rex error:', e);
      setParsed(null);
      setStage('idle');
      Alert.alert('Hey Rex', 'Something went wrong. Try again.');
    }
  }

  // Web fallback: process typed text instead of voice
  async function processWebInput() {
    const text = webInput.trim();
    if (!text) { Alert.alert('Type your notes first'); return; }
    setStage('processing');
    setShowSheet(true);
    setTranscript(text);
    setParsed(null);
    setSaved(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStage('idle'); return; }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id,first_name,last_name,notes,phone,vehicle_make,vehicle_model')
      .eq('user_id', user.id);

    const contactList = (contacts ?? [])
      .map((c: any) => `${c.first_name} ${c.last_name} (id:${c.id})`)
      .join(', ') || 'No contacts yet';

    if (!ANTHROPIC_KEY) {
      setParsed({
        customer_name: 'Add ANTHROPIC_KEY to activate',
        contact_id: null, phone: null,
        interests: text, objections: '',
        follow_up_in_days: null, follow_up_note: '',
        updated_notes: text,
        game_plan: 'Add your Anthropic API key to .env to get Rex\'s full game plan.',
        vehicle_interest: null, lease_end_date: null,
        personal_events: [], buying_urgency: 'medium',
      });
      setStage('done');
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const industryLabel = INDUSTRY_CONFIG[userIndustry]?.label ?? 'Sales';
      const systemPrompt = `You are Rex, a sales intake AI for a ${industryLabel} rep.\nYour job: extract ALL key info and return a JSON object ONLY — no other text, no markdown.\n\nToday's date: ${today}\nIndustry: ${industryLabel}\nContacts in their book: ${contactList}\n\nReturn this exact JSON shape:\n{\n  "customer_name": "Full name mentioned",\n  "contact_id": "the id from the contacts list if name matches, or null",\n  "phone": "phone number mentioned or null",\n  "interests": "what they want / are interested in",\n  "objections": "objections or hesitations mentioned",\n  "follow_up_in_days": number or null,\n  "follow_up_note": "brief reminder of what to say/do on follow-up",\n  "updated_notes": "2-4 sentences of clean notes, present tense, no filler",\n  "game_plan": "2-3 sentence game plan — specific angle, what to lead with next call, one risk to avoid",\n  "vehicle_interest": "specific item/product they are interested in, or null",\n  "lease_end_date": "YYYY-MM-DD if a contract/lease end date is mentioned, or null",\n  "personal_events": [{ "type": "baby_due|anniversary|birthday|other", "date": "YYYY-MM-DD" }],\n  "buying_urgency": "low|medium|high based on timeline and intent signals"\n}`;

      const rr = await fetch(`${AI_PROXY_URL}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: REX_MODEL, max_tokens: 600, system: systemPrompt, messages: [{ role: 'user', content: text }] }),
      });
      const rj = await rr.json();
      const raw = rj.content?.[0]?.text ?? '{}';
      let intake: ParsedIntake;
      try { intake = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); }
      catch { intake = { customer_name: 'Unknown', contact_id: null, phone: null, interests: text, objections: '', follow_up_in_days: null, follow_up_note: '', updated_notes: text, game_plan: "Rex couldn't fully parse that.", vehicle_interest: null, lease_end_date: null, personal_events: [], buying_urgency: 'medium' }; }
      setParsed(intake);
      setStage('done');
    } catch (e) {
      console.warn('Hey Rex web error:', e);
      setStage('idle');
      Alert.alert('Hey Rex', 'Something went wrong. Try again.');
    }
  }

  async function saveToContact() {
    if (!parsed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Build follow-up date
    let followUpDate: string | null = null;
    if (parsed.follow_up_in_days) {
      const d = new Date();
      d.setDate(d.getDate() + parsed.follow_up_in_days);
      followUpDate = d.toISOString().split('T')[0];
    }

    const noteWithPlan = [
      parsed.updated_notes,
      parsed.vehicle_interest ? `Looking at: ${parsed.vehicle_interest}` : '',
      parsed.follow_up_note ? `Follow-up: ${parsed.follow_up_note}` : '',
    ].filter(Boolean).join('\n');

    let savedContactId = parsed.contact_id;

    if (parsed.contact_id) {
      // Update existing contact
      await supabase.from('contacts').update({
        notes: noteWithPlan,
        last_contact_date: new Date().toISOString().split('T')[0],
        follow_up_date: followUpDate,
        ...(parsed.lease_end_date ? { lease_end_date: parsed.lease_end_date } : {}),
        personal_events: parsed.personal_events ?? [],
        buying_urgency: parsed.buying_urgency ?? null,
      }).eq('id', parsed.contact_id);
    } else {
      // Create new contact from voice intake
      const nameParts = parsed.customer_name.trim().split(' ');
      const { data: newContact } = await supabase.from('contacts').insert({
        user_id: user.id,
        first_name: nameParts[0] ?? parsed.customer_name,
        last_name: nameParts.slice(1).join(' ') || '',
        phone: parsed.phone ?? '',
        notes: noteWithPlan,
        last_contact_date: new Date().toISOString().split('T')[0],
        follow_up_date: followUpDate,
        lease_end_date: parsed.lease_end_date ?? null,
        personal_events: parsed.personal_events ?? [],
        buying_urgency: parsed.buying_urgency ?? null,
        stage: 'prospect',
      }).select('id').single();
      savedContactId = newContact?.id ?? null;
    }

    // Save to rex_messages log
    await supabase.from('rex_messages').insert([
      { user_id: user.id, role: 'user', content: `[Voice Intake] ${transcript}` },
      { user_id: user.id, role: 'assistant', content: `Game plan for ${parsed.customer_name}: ${parsed.game_plan}` },
    ]);

    // Generate AI sequence + schedule notifications in background
    if (savedContactId && ANTHROPIC_KEY) {
      setGeneratingSeq(true);
      try {
        const [steps, notifCount] = await Promise.all([
          generatePersonalizedSequence(parsed, user.id, savedContactId),
          scheduleNotifications(savedContactId, parsed.customer_name, followUpDate, parsed),
        ]);
        setGeneratedSteps(steps);
        setReminderCount(notifCount);
      } catch (e) {
        console.warn('Sequence/notification error:', e);
      } finally {
        setGeneratingSeq(false);
      }
    }

    setSaved(true);
  }

  async function generatePersonalizedSequence(
    intake: ParsedIntake,
    userId: string,
    contactId: string,
  ): Promise<GeneratedStep[]> {
    const prompt = `
The sales rep just logged a customer. Build a personalized follow-up sequence for this specific person.
Return a JSON array ONLY — no markdown, no other text.

Customer details:
- Name: ${intake.customer_name}
- Interested in: ${intake.vehicle_interest ?? intake.interests}
- Notes: ${intake.updated_notes}
- Lease/contract ends: ${intake.lease_end_date ?? 'unknown'}
- Personal events: ${intake.personal_events.length ? JSON.stringify(intake.personal_events) : 'none'}
- Buying urgency: ${intake.buying_urgency}
- Rep follow-up note: ${intake.follow_up_note}

Rules:
- 4 to 7 steps total
- Space them out based on urgency and lease timeline
- Messages must be specific to THIS person — use their name, vehicle interest, and personal events
- Natural, conversational tone — not corporate or generic
- Mix channels: mostly text, one call, maybe one email
- Each message should move the deal forward one step

Return format (JSON array):
[
  { "delay_days": 0, "channel": "text", "message": "Hey [name], ..." },
  ...
]
`.trim();

    const r = await fetch(`${AI_PROXY_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: REX_MODEL,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const rj = await r.json();
    const raw = rj.content?.[0]?.text ?? '[]';
    let steps: GeneratedStep[] = [];
    try {
      steps = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    } catch { steps = []; }

    // Save to Supabase
    if (steps.length > 0) {
      const { data: seq } = await supabase.from('sequences').insert({
        user_id: userId,
        contact_id: contactId,
        name: `Follow-up: ${intake.customer_name}`,
        description: `AI-generated from voice intake. ${intake.vehicle_interest ? `Interested in: ${intake.vehicle_interest}.` : ''}`,
        industry: userIndustry,
        is_template: false,
        is_custom: true,
      }).select('id').single();

      if (seq?.id) {
        await supabase.from('sequence_steps').insert(
          steps.map((st, i) => ({
            sequence_id: seq.id,
            step_number: i + 1,
            delay_days: st.delay_days,
            channel: st.channel,
            message_template: st.message,
            ai_personalize: false,
          }))
        );
      }
    }

    return steps;
  }

  async function scheduleNotifications(
    contactId: string,
    contactName: string,
    followUpDate: string | null,
    intake: ParsedIntake,
  ): Promise<number> {
    await requestNotificationPermission();
    return scheduleContactReminders({
      contactId,
      contactName,
      followUpDate,
      leaseEndDate: intake.lease_end_date,
      personalEvents: intake.personal_events ?? [],
    });
  }

  function dismiss() {
    setShowSheet(false);
    setStage('idle');
  }

  const orbBg = stage === 'listening' ? colors.red
    : stage === 'processing' ? colors.orange
    : stage === 'done' ? colors.green
    : colors.gold;

  const orbIcon = stage === 'listening' ? '⏹' : stage === 'processing' ? '…' : stage === 'done' ? '✓' : '🎙';

  if (onRexTab) return null;

  return (
    <>
      {/* Web: text input + Process button instead of mic orb */}
      {isWeb ? (
        <View style={s.webInputRow}>
          <TextInput
            style={s.webInput}
            value={webInput}
            onChangeText={setWebInput}
            placeholder="Type your post-meeting notes here… (name, vehicle, follow-up, etc.)"
            placeholderTextColor={colors.grey}
            multiline
            numberOfLines={2}
          />
          <TouchableOpacity style={s.webBtn} onPress={stage === 'idle' || stage === 'done' ? processWebInput : () => setShowSheet(true)} activeOpacity={0.85}>
            {stage === 'processing' ? <ActivityIndicator color={colors.ink} size="small" /> : <Text style={s.webBtnText}>{stage === 'done' ? 'View →' : 'Process →'}</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        /* Native: persistent gold mic orb — floats above tab bar, left side */
        <Animated.View style={[s.orbWrap, { transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity
            style={[s.orb, { backgroundColor: orbBg }]}
            onPress={stage === 'idle' ? startListening : stage === 'listening' ? stopListening : () => setShowSheet(true)}
            activeOpacity={0.85}
          >
            <Text style={s.orbIcon}>{orbIcon}</Text>
          </TouchableOpacity>
          {stage === 'idle' && <Text style={s.orbLabel}>Hey Rex</Text>}
        </Animated.View>
      )}

      {/* Bottom sheet */}
      <Modal visible={showSheet} animationType="slide" transparent>
        <Pressable style={s.overlay} onPress={stage === 'done' ? dismiss : undefined}>
          <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
            <View style={s.handle} />

            {/* ── Listening ── */}
            {stage === 'listening' && (
              <View style={s.listenBody}>
                <Animated.View style={[s.bigOrb, { transform: [{ scale: pulseAnim }] }]}>
                  <TouchableOpacity onPress={stopListening} activeOpacity={0.8} style={s.bigOrbInner}>
                    <Text style={s.bigOrbStop}>⏹</Text>
                    <Text style={s.bigOrbHint}>Tap to stop</Text>
                  </TouchableOpacity>
                </Animated.View>
                <Text style={s.listenTitle}>Listening…</Text>
                <Text style={s.listenSub}>
                  Say the customer's name and everything you want to remember.{'\n\n'}
                  <Text style={{ fontStyle: 'italic' }}>"Marcus Webb — interested in the F-150 XLT, not the Raptor, too pricey. Wants pricing by Friday. Call him Monday, he'll be free."</Text>
                </Text>
              </View>
            )}

            {/* ── Processing ── */}
            {stage === 'processing' && (
              <View style={s.processingBody}>
                <ActivityIndicator color={colors.gold} size="large" />
                <Text style={s.processingTitle}>Rex is parsing your notes…</Text>
                <Text style={s.processingLabel}>Matching contact · Extracting follow-up · Building game plan</Text>
              </View>
            )}

            {/* ── Done ── */}
            {stage === 'done' && parsed && (
              <ScrollView style={s.doneScroll} showsVerticalScrollIndicator={false}>
                {/* Contact match */}
                <View style={s.matchRow}>
                  <View style={[s.matchDot, { backgroundColor: parsed.contact_id ? colors.green : colors.gold }]} />
                  <Text style={s.matchText}>
                    {parsed.contact_id ? `Matched: ${parsed.customer_name}` : `New contact: ${parsed.customer_name}`}
                  </Text>
                </View>

                {/* Notes preview */}
                <View style={s.card}>
                  <Text style={s.cardLabel}>Notes to save</Text>
                  <Text style={s.cardBody}>{parsed.updated_notes}</Text>
                </View>

                {/* Interests + objections */}
                {(parsed.interests || parsed.objections) ? (
                  <View style={s.splitRow}>
                    {parsed.interests ? (
                      <View style={[s.splitCard, { borderColor: colors.greenBorder, backgroundColor: colors.greenBg }]}>
                        <Text style={[s.splitLabel, { color: colors.green }]}>Wants</Text>
                        <Text style={s.splitBody}>{parsed.interests}</Text>
                      </View>
                    ) : null}
                    {parsed.objections ? (
                      <View style={[s.splitCard, { borderColor: colors.redBorder, backgroundColor: colors.redBg }]}>
                        <Text style={[s.splitLabel, { color: colors.red }]}>Hesitations</Text>
                        <Text style={s.splitBody}>{parsed.objections}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Follow-up */}
                {parsed.follow_up_in_days ? (
                  <View style={s.followUpRow}>
                    <Text style={s.followUpIcon}>📅</Text>
                    <View>
                      <Text style={s.followUpLabel}>
                        Follow-up in {parsed.follow_up_in_days} day{parsed.follow_up_in_days === 1 ? '' : 's'}
                      </Text>
                      {parsed.follow_up_note ? <Text style={s.followUpNote}>{parsed.follow_up_note}</Text> : null}
                    </View>
                  </View>
                ) : null}

                {/* Lease / vehicle interest if extracted */}
                {(parsed.lease_end_date || parsed.vehicle_interest) ? (
                  <View style={s.leaseRow}>
                    {parsed.vehicle_interest ? <Text style={s.leaseChip}>🚗 {parsed.vehicle_interest}</Text> : null}
                    {parsed.lease_end_date ? <Text style={s.leaseChip}>📅 Lease ends {parsed.lease_end_date}</Text> : null}
                    {parsed.buying_urgency === 'high' ? <Text style={[s.leaseChip, s.urgentChip]}>🔥 High urgency</Text> : null}
                  </View>
                ) : null}

                {/* Game plan */}
                <View style={s.gamePlanBox}>
                  <Text style={s.gamePlanLabel}>🎯 Rex's Game Plan</Text>
                  <Text style={s.gamePlanText}>{parsed.game_plan}</Text>
                </View>

                {/* Generated sequence (shown after save) */}
                {saved && (generatingSeq || generatedSteps.length > 0) ? (
                  <View style={s.seqBox}>
                    <TouchableOpacity
                      style={s.seqHeader}
                      onPress={() => setSequenceExpanded(e => !e)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.seqTitle}>
                        {generatingSeq ? '⏳ Building sequence…' : `📋 Sequence created (${generatedSteps.length} steps)`}
                      </Text>
                      {!generatingSeq && <Text style={s.seqChevron}>{sequenceExpanded ? '▲' : '▼'}</Text>}
                    </TouchableOpacity>
                    {sequenceExpanded && generatedSteps.map((st, i) => (
                      <View key={i} style={s.seqStep}>
                        <Text style={s.seqStepDay}>Day {st.delay_days}</Text>
                        <Text style={s.seqStepChannel}>{st.channel === 'text' ? '💬' : st.channel === 'call' ? '📞' : '📧'}</Text>
                        <Text style={s.seqStepMsg} numberOfLines={2}>{st.message}</Text>
                      </View>
                    ))}
                    {reminderCount > 0 && !generatingSeq ? (
                      <Text style={s.reminderBadge}>🔔 {reminderCount} reminder{reminderCount !== 1 ? 's' : ''} scheduled</Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Actions */}
                <View style={s.actions}>
                  <TouchableOpacity style={s.btnSecondary} onPress={dismiss} activeOpacity={0.8}>
                    <Text style={s.btnSecondaryText}>Discard</Text>
                  </TouchableOpacity>
                  {saved ? (
                    <View style={[s.btnPrimary, { backgroundColor: colors.green }]}>
                      <Text style={s.btnPrimaryText}>✓ Saved to Book</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={s.btnPrimary} onPress={saveToContact} activeOpacity={0.85}>
                      <Text style={s.btnPrimaryText}>
                        {parsed.contact_id ? 'Save to Contact →' : 'Create Contact →'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  orbWrap: {
    position: 'absolute', bottom: 90, left: 20, zIndex: 999,
    alignItems: 'center',
  },
  orb: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  orbIcon: { fontSize: 22 },
  orbLabel: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.5, marginTop: 4, textTransform: 'uppercase' },
  // Web text input fallback
  webInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    backgroundColor: colors.ink2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  webInput: {
    flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.sm, color: colors.white, fontSize: 13,
    minHeight: 44, maxHeight: 88,
  },
  webBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    alignItems: 'center', justifyContent: 'center', minWidth: 80,
  },
  webBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, paddingBottom: 36, maxHeight: '88%',
  },
  handle: { width: 36, height: 4, backgroundColor: colors.ink4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  // Listening
  listenBody: { alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.md },
  bigOrb: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: colors.redBg, borderWidth: 2, borderColor: colors.redBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  bigOrbInner: { alignItems: 'center', gap: 4 },
  bigOrbStop: { fontSize: 30, color: colors.red },
  bigOrbHint: { fontSize: 10, color: colors.red, fontWeight: '700' },
  listenTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  listenSub: { color: colors.grey2, fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  // Processing
  processingBody: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  processingTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  processingLabel: { color: colors.grey2, fontSize: 12, textAlign: 'center' },
  // Done
  doneScroll: { maxHeight: 560 },
  matchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: spacing.md,
  },
  matchDot: { width: 8, height: 8, borderRadius: 4 },
  matchText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardLabel: { fontSize: 10, fontWeight: '700', color: colors.grey, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  cardBody: { color: colors.grey3, fontSize: 13, lineHeight: 20 },
  splitRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  splitCard: { flex: 1, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  splitLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  splitBody: { color: colors.grey3, fontSize: 12, lineHeight: 17 },
  followUpRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm,
  },
  followUpIcon: { fontSize: 16, marginTop: 1 },
  followUpLabel: { color: colors.gold2, fontWeight: '700', fontSize: 13 },
  followUpNote: { color: colors.grey3, fontSize: 12, marginTop: 2 },
  gamePlanBox: {
    backgroundColor: colors.ink3, borderWidth: 1, borderColor: 'rgba(212,168,67,0.2)',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
  },
  gamePlanLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 0.3, marginBottom: 8 },
  gamePlanText: { color: colors.white, fontSize: 14, lineHeight: 22 },
  // Lease / vehicle chips
  leaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  leaseChip: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
    color: colors.grey3, fontSize: 11, fontWeight: '600',
  },
  urgentChip: { borderColor: colors.redBorder, backgroundColor: colors.redBg, color: colors.red },
  // Sequence box
  seqBox: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(212,168,67,0.2)',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  seqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seqTitle: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  seqChevron: { color: colors.grey, fontSize: 10 },
  seqStep: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.ink4, marginTop: spacing.sm,
  },
  seqStepDay: { color: colors.grey, fontSize: 10, fontWeight: '700', minWidth: 32 },
  seqStepChannel: { fontSize: 12 },
  seqStepMsg: { color: colors.grey3, fontSize: 12, flex: 1, lineHeight: 17 },
  reminderBadge: {
    marginTop: spacing.sm, color: colors.grey2, fontSize: 11,
    borderTopWidth: 1, borderTopColor: colors.ink4, paddingTop: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btnSecondary: {
    flex: 1, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.md, alignItems: 'center',
  },
  btnSecondaryText: { color: colors.grey2, fontWeight: '600', fontSize: 14 },
  btnPrimary: {
    flex: 2, backgroundColor: colors.gold,
    borderRadius: radius.sm, padding: spacing.md, alignItems: 'center',
  },
  btnPrimaryText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});
