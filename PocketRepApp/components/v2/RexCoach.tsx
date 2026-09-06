// Rex Coach — the tap-to-open text coaching chat. This is the only thing the
// gold orb opens in text-only V1. It coaches by default and may propose a small
// allow-list of app actions; every action still requires an explicit Confirm.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import RadarLoader from './RadarLoader';
import ConversationComposer from './ConversationComposer';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import { callBrain, callBrainStream, warmBrain } from '@/lib/v2/aiProxy';
import { serializeRepContext, loadMtdSummary, loadRecentActivity, type MtdSummary } from '@/lib/v2/repContext';
import { buildCoachMessages, type RepIdentity } from '@/lib/v2/coachBrain';
import { isRexChatEnabled, isVehicleFinderEnabled, isRexTriadEnabled } from '@/lib/v2/rexFeatureFlags';
import { runTriadCoach } from '@/lib/v2/rexTriad';
import { loadTodayServerThread, loadRepIdentity } from '@/lib/v2/coachThread';
import { recordRexTurn } from '@/lib/v2/rexMemory';
import {
  parseCoachReply, executeAction, summarizeAction, logRexAction, type RexAction,
} from '@/lib/v2/rexActions';
import { extractFromConversation, type ConversationParse } from '@/lib/v2/conversationParse';
import { getTodayLog, getCarrySummary, appendCoachEntry } from '@/lib/v2/coachLog';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { PayPlan } from '@/lib/v2/payPlan';
import { chooseRexTier, isWholeBookRequest, resolveMentionedContactId } from '@/lib/v2/rexRouting';
import { logInteraction } from '@/lib/v2/interactions';

const COACH_ACTIONS = new Set<RexAction['type']>([
  'add_contact', 'update_notes', 'schedule_followup', 'retier_contact', 'log_deal', 'create_reminder',
  'create_blast_sequence',
  ...(isVehicleFinderEnabled() ? (['find_vehicles'] as RexAction['type'][]) : []),
]);

const REX_CHAT = isRexChatEnabled();
const TRIAD = REX_CHAT && isRexTriadEnabled();

type ChatMessage = { from: 'rex' | 'user'; text: string; time: string };
export type RexCoachMission = 'sold_book_last_month' | 'sold_book_previous_month';
type ActionResult = { ok: boolean; openContactId?: string; filteredIds?: string[] };

const QUICK_CHIPS = [
  "Payment's too high",
  'They want to think about it',
  'Lead went quiet — how do I follow up?',
  "What's my best move today?",
];

const COACH_OPENERS = [
  "Morning. What are we working on, a deal, a rebuttal, or your day?",
  "Quick read on your week, what do you want to sharpen first?",
  "I'm here. Throw me a customer situation and I'll give you the move.",
];

function stamp(): string {
  const n = new Date();
  return `${n.getHours()}:${String(n.getMinutes()).padStart(2, '0')}`;
}

export default function RexCoach({
  open,
  onClose,
  contacts,
  payPlan,
  onActed,
  onOpenContact,
  onDraftFirstText,
  onEnrollFreshUp,
  initialContactId = null,
  mission = null,
  missionCount = 0,
  onFinishMission,
}: {
  open: boolean;
  onClose: () => void;
  contacts: V2Contact[];
  payPlan: PayPlan | null;
  onActed?: (action: RexAction, result?: ActionResult) => void | Promise<void>;
  onOpenContact?: (id: string) => void;
  onDraftFirstText?: (contactId: string) => void | Promise<void>;
  onEnrollFreshUp?: (contactId: string) => void | Promise<void>;
  initialContactId?: string | null;
  mission?: RexCoachMission | null;
  missionCount?: number;
  onFinishMission?: () => void | Promise<void>;
}) {
  const greeting = useRef(COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [retry, setRetry] = useState<{ text: string; history: ChatMessage[] } | null>(null);
  const [mtd, setMtd] = useState<MtdSummary | null>(null);
  const [activity, setActivity] = useState('');
  const [pending, setPending] = useState<RexAction | null>(null);
  const [newContactReady, setNewContactReady] = useState<{ id: string; name: string } | null>(null);
  const [newContactBusy, setNewContactBusy] = useState<'text' | 'sequence' | null>(null);
  const [acting, setActing] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ConversationParse | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const repIdent = useRef<RepIdentity>({});
  const activeContactIdRef = useRef<string | null>(null);
  const interactedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const update = () => setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  useEffect(() => {
    if (open) {
      greeting.current = COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)];
      const carry = getCarrySummary();
      const today = getTodayLog();
      const seeded: ChatMessage[] = [];
      if (mission) {
        const monthLabel = mission === 'sold_book_last_month' ? 'last month' : 'the month before that';
        seeded.push({
          from: 'rex',
          text: `Let’s build your sold book from ${monthLabel}. Tell me one customer’s name, phone, vehicle, and anything you remember. I’ll build the card.`,
          time: stamp(),
        });
      } else {
        if (carry) seeded.push({ from: 'rex', text: `↺ Yesterday — ${carry}`, time: stamp() });
        if (today.length > 0) {
          for (const e of today) seeded.push({ from: e.role, text: e.text, time: e.time });
        } else {
          seeded.push({ from: 'rex', text: greeting.current, time: stamp() });
        }
      }
      setMessages(seeded);
      setInput('');
      setTyping(false);
      setRetry(null);
      setPending(null);
      setNewContactReady(null);
      setNewContactBusy(null);
      setActing(false);
      setParseOpen(false);
      setParsing(false);
      setParseResult(null);
      setStreamText(null);
      interactedRef.current = false;
      activeContactIdRef.current = initialContactId && contacts.some(c => c.id === initialContactId)
        ? initialContactId
        : null;
      warmBrain();
      loadMtdSummary().then(setMtd).catch(() => setMtd(null));
      loadRecentActivity().then(setActivity).catch(() => setActivity(''));
      if (REX_CHAT) {
        loadRepIdentity().then(r => { repIdent.current = r; }).catch(() => undefined);
        if (!mission) {
          loadTodayServerThread().then(rows => {
            if (!rows || rows.length === 0 || interactedRef.current) return;
            if (rows.length <= today.length) return;
            const restored: ChatMessage[] = [];
            if (carry) restored.push({ from: 'rex', text: `↺ Yesterday — ${carry}`, time: stamp() });
            for (const t of rows) restored.push({ from: t.from, text: t.text, time: t.time });
            setMessages(restored);
          }).catch(() => undefined);
        }
      }
    }
  }, [open, mission]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, typing, streamText, open]);

  if (!open) return null;

  const pushUser = (text: string) => {
    setMessages(m => [...m, { from: 'user', text, time: stamp() }]);
    appendCoachEntry({ role: 'user', text, time: stamp() });
  };
  const pushRex = (text: string) => {
    setMessages(m => [...m, { from: 'rex', text, time: stamp() }]);
    appendCoachEntry({ role: 'rex', text, time: stamp() });
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    interactedRef.current = true;
    setRetry(null);
    setPending(null);
    const history = messages;
    pushUser(text);
    setInput('');
    await deliver(text, history);
  };

  const deliver = async (text: string, history: ChatMessage[]) => {
    setTyping(true);
    const repContext = serializeRepContext({ contacts, payPlan, mtd });
    const wholeBook = isWholeBookRequest(text);
    const mentionedContactId = resolveMentionedContactId(text, contacts);
    if (wholeBook) activeContactIdRef.current = null;
    else if (mentionedContactId) activeContactIdRef.current = mentionedContactId;
    const turnContactId = wholeBook ? null : activeContactIdRef.current;
    const activeContact = turnContactId ? contacts.find(c => c.id === turnContactId) : null;
    const scopedActivity = activeContact
      ? `ACTIVE CUSTOMER: ${activeContact.name} (${activeContact.id}). Keep this turn scoped to this customer unless the rep explicitly names someone else.\n${activity}`
      : activity;
    let activeTier = chooseRexTier({ workload: 'routine', text });
    let attempt = 0;
    let useTriad = TRIAD && !mission;
    try {
      for (;;) {
        try {
          if (useTriad) {
            try {
              const { reply, action } = await runTriadCoach({
                planner: {
                  history: wholeBook ? [] : history, text, repContext,
                  contacts: contacts.map(c => ({ id: c.id, name: c.name, days: c.days })),
                  recentActivity: scopedActivity,
                  rep: repIdent.current,
                },
                rep: repIdent.current,
                onDelta: (full) => setStreamText(full),
              });
              const actionable = !!action && COACH_ACTIONS.has(action.type);
              const line = reply || (actionable ? summarizeAction(action!) : '');
              if (!line) throw new Error('empty');
              setStreamText(null);
              pushRex(line);
              if (actionable) setPending(action!);
              if (!actionable && turnContactId) {
                logInteraction(turnContactId, 'game_plan', `Rex game plan: ${line}`).catch(() => undefined);
              }
              recordRexTurn(text, line, turnContactId).catch(() => undefined);
              return;
            } catch (e: any) {
              if (!String(e?.message ?? '').includes('triad plan')) throw e;
              useTriad = false;
              setStreamText(null);
            }
          }

          const brainOpts = {
            maxTokens: 1200,
            tier: activeTier,
            messages: buildCoachMessages({
              history: wholeBook ? [] : history, text, repContext,
              contacts: contacts.map(c => ({ id: c.id, name: c.name, days: c.days })),
              recentActivity: scopedActivity,
              rep: REX_CHAT ? repIdent.current : undefined,
              missionContext: mission
                ? `SOLD CUSTOMER CAPTURE MISSION: The rep is entering customers they personally sold ${mission === 'sold_book_last_month' ? 'last month' : 'the month before last'}. When they give enough information to identify one customer, propose add_contact immediately with is_past_customer=true. Capture phone, email, vehicle and any useful context they provide. Put the sold timing/month in notes. Do not ask for optional fields they did not mention. Handle one customer at a time. The app has a separate Done button that builds outreach, so do not create a blast from this mission unless the rep explicitly asks outside the guided flow.`
                : '',
            }),
          };
          const reply = REX_CHAT
            ? (await callBrainStream({
                ...brainOpts,
                timeoutMs: 60_000,
                onDelta: (full) => setStreamText(full.split('```')[0].replace(/`{1,2}\s*$/, '')),
              })).trim()
            : (await callBrain(brainOpts)).trim();
          if (!reply) throw new Error('empty');
          const { spoken, action } = parseCoachReply(reply);
          const actionable = !!action && COACH_ACTIONS.has(action.type);
          const line = spoken || (actionable ? summarizeAction(action!) : reply);
          setStreamText(null);
          pushRex(line);
          if (actionable) setPending(action!);
          if (!actionable && turnContactId) {
            logInteraction(turnContactId, 'game_plan', `Rex game plan: ${line}`).catch(() => undefined);
          }
          if (REX_CHAT) recordRexTurn(text, line, turnContactId).catch(() => undefined);
          return;
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          const transient = msg.includes('timeout') || msg.includes('network') || msg.includes('empty');
          if (attempt === 0 && transient) {
            attempt++;
            if (activeTier === 'pro') activeTier = 'flash';
            useTriad = false;
            setStreamText(null);
            await warmBrain();
            continue;
          }
          throw e;
        }
      }
    } catch {
      setMessages(m => [...m, {
        from: 'rex',
        text: "Rex hit a connection snag. Your work is safe. Tap Retry.",
        time: stamp(),
      }]);
      setRetry({ text, history });
    } finally {
      setTyping(false);
      setStreamText(null);
    }
  };

  const doRetry = () => {
    if (!retry || typing) return;
    const r = retry;
    setRetry(null);
    deliver(r.text, r.history);
  };

  const confirmAction = async () => {
    if (!pending || acting) return;
    const action: RexAction = mission && pending.type === 'add_contact'
      ? {
          ...pending,
          payload: {
            ...pending.payload,
            is_past_customer: true,
            notes: [
              pending.payload.notes,
              mission === 'sold_book_last_month'
                ? 'Sold customer capture: sold last month.'
                : 'Sold customer capture: sold the month before last.',
            ].filter(Boolean).join(' '),
          },
        }
      : pending;
    setActing(true);
    try {
      const result = await executeAction(action, contacts);
      await onActed?.(action, result);
      logRexAction(action, 'success').catch(() => undefined);
      if (mission && action.type === 'add_contact') {
        pushRex(`✓ Added ${action.payload.first_name}${action.payload.last_name ? ` ${action.payload.last_name}` : ''}. Give me the next sold customer, or tap Done when you're ready for the Text Queue.`);
      } else if (action.type === 'add_contact' && result.openContactId) {
        const contactName = `${action.payload.first_name}${action.payload.last_name ? ` ${action.payload.last_name}` : ''}`;
        pushRex(`✓ Added ${contactName}. Customer card is ready — want to send the first thank-you or put them on Fresh Up?`);
        setNewContactReady({ id: result.openContactId, name: contactName });
      } else if (action.type === 'log_deal') {
        // Deterministic Hunter-flavored celebration for a verified win that
        // just happened -- no model call, so the copy can't drift or invent
        // anything beyond what the rep just logged.
        const p = action.payload as any;
        pushRex(`SALE LOGGED. ${p.customer_name}${p.vehicle ? ` · ${p.vehicle}` : ''}. Good work — who's next?`);
      } else {
        pushRex(`✓ Done — ${summarizeAction(action)}`);
        if (result.openContactId) onOpenContact?.(result.openContactId);
      }
      setPending(null);
    } catch (e: any) {
      logRexAction(action, 'failed', { failure_reason: e?.message }).catch(() => undefined);
      setMessages(m => [...m, {
        from: 'rex',
        text: `Couldn't do that: ${e?.message ?? 'save failed'}. Want to try again?`,
        time: stamp(),
      }]);
    } finally {
      setActing(false);
    }
  };

  const cancelAction = () => {
    if (acting) return;
    setPending(null);
    setMessages(m => [...m, { from: 'rex', text: 'Okay, holding off — nothing saved.', time: stamp() }]);
  };

  const runParse = async (transcript: string) => {
    interactedRef.current = true;
    setParseOpen(false);
    setPending(null);
    setParseResult(null);
    pushUser(`🎙 Parse this conversation (${transcript.length} chars)`);
    setParsing(true);
    setTyping(true);
    try {
      const result = await extractFromConversation(transcript, contacts.map(c => ({ id: c.id, name: c.name })));
      const who = result.is_new
        ? (`${result.first_name ?? ''} ${result.last_name ?? ''}`.trim() || 'a new lead')
        : (contacts.find(c => c.id === result.match_contact_id)?.name ?? 'the contact');
      setParseResult(result);
      pushRex(`Got it — here's what I pulled from that conversation with ${who}. Review and confirm to save.`);
    } catch (e: any) {
      setMessages(m => [...m, { from: 'rex', text: `Couldn't parse that one: ${e?.message ?? 'failed'}. Try again?`, time: stamp() }]);
    } finally {
      setParsing(false);
      setTyping(false);
    }
  };

  const confirmParse = async () => {
    if (!parseResult || acting) return;
    const r = parseResult;
    setActing(true);
    try {
      let contactId = r.match_contact_id;
      const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'the contact';
      if (r.is_new || !contactId) {
        const add: RexAction = {
          type: 'add_contact', say: '',
          payload: {
            first_name: r.first_name ?? 'New lead',
            last_name: r.last_name ?? undefined,
            phone: r.phone ?? undefined,
            vehicle: r.vehicle ?? undefined,
            budget: r.budget ?? undefined,
            trade_in: r.trade_in ?? undefined,
            notes: r.notes || undefined,
            heat_tier: r.heat_tier ?? undefined,
          },
        };
        const res = await executeAction(add, contacts);
        logRexAction(add, 'success').catch(() => undefined);
        contactId = res.openContactId ?? null;
        onActed?.(add, res);
      } else {
        const upd: RexAction = {
          type: 'update_notes', say: '',
          payload: { contact_id: contactId, contact_name: name, notes_append: r.notes },
        };
        const updResult = await executeAction(upd, contacts);
        logRexAction(upd, 'success').catch(() => undefined);
        onActed?.(upd, updResult);
      }
      if (contactId && r.followup_days && r.followup_days > 0) {
        const fu: RexAction = {
          type: 'schedule_followup', say: '',
          payload: { contact_id: contactId, contact_name: name, days_from_now: r.followup_days, note: r.plan },
        };
        const fuResult = await executeAction(fu, contacts);
        logRexAction(fu, 'success').catch(() => undefined);
        onActed?.(fu, fuResult);
      }
      pushRex(`✓ Saved. ${r.is_new ? 'Added' : 'Updated'} ${name}${r.followup_days ? ` · follow-up in ${r.followup_days}d` : ''}.`);
      if (r.plan) pushRex(`Plan: ${r.plan}`);
      if (contactId) onOpenContact?.(contactId);
      setParseResult(null);
    } catch (e: any) {
      setMessages(m => [...m, { from: 'rex', text: `Couldn't save that: ${e?.message ?? 'failed'}.`, time: stamp() }]);
    } finally {
      setActing(false);
    }
  };

  const cancelParse = () => {
    if (acting) return;
    setParseResult(null);
    setMessages(m => [...m, { from: 'rex', text: 'Scrapped that parse — nothing saved.', time: stamp() }]);
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, kbInset > 0 ? ({ bottom: kbInset } as any) : null]}>
        <View style={styles.header}>
          <View style={styles.live} />
          <Text style={styles.headerLabel} accessibilityLiveRegion="polite">
            {typing ? 'REX · WORKING' : 'REX · LIVE'}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={6}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messages}>
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubbleRow, { justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }]}>
              <View style={{ maxWidth: '84%' }}>
                {m.from === 'rex' ? <Label color={colors.gold}>REX · COACH</Label> : null}
                <View style={[styles.bubble, m.from === 'user' ? styles.bubbleUser : styles.bubbleRex]}>
                  <Text style={[styles.bubbleText, m.from === 'user' && { color: colors.white }]}>{m.text}</Text>
                </View>
                <Text style={[styles.time, { textAlign: m.from === 'user' ? 'right' : 'left' }]}>{m.time}</Text>
              </View>
            </View>
          ))}
          {streamText ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={{ maxWidth: '84%' }}>
                <Label color={colors.gold}>REX · COACH</Label>
                <View style={[styles.bubble, styles.bubbleRex]}><Text style={styles.bubbleText}>{streamText}</Text></View>
              </View>
            </View>
          ) : null}
          {typing && !streamText ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, styles.bubbleRex, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <RadarLoader size={16} />
                <Text style={styles.bubbleText} accessibilityLiveRegion="polite">Rex is working the board…</Text>
              </View>
            </View>
          ) : null}
          {retry && !typing ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}><Pressable onPress={doRetry} style={styles.retryBtn}><Text style={styles.retryText}>↻ Retry</Text></Pressable></View>
          ) : null}
          {pending ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.proposeCard}>
                <Text style={styles.proposeLabel}>PROPOSED · CONFIRM TO SAVE</Text>
                <Text style={styles.proposeText}>{summarizeAction(pending)}</Text>
                <View style={styles.proposeActions}>
                  <Pressable onPress={cancelAction} disabled={acting} style={styles.proposeCancel}><Text style={styles.proposeCancelText}>Cancel</Text></Pressable>
                  <Pressable onPress={confirmAction} disabled={acting} style={styles.proposeConfirm}><Text style={styles.proposeConfirmText}>{acting ? 'Saving…' : 'Confirm'}</Text></Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {newContactReady ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.quickContactCard}>
                <Text style={styles.quickContactLabel}>NEW CUSTOMER READY</Text>
                <Text style={styles.quickContactName}>{newContactReady.name}</Text>
                <Text style={styles.quickContactHint}>Rex can turn the card into the first move without making you retype anything.</Text>
                <Pressable disabled={!!newContactBusy} onPress={async () => {
                  setNewContactBusy('text');
                  try { await onDraftFirstText?.(newContactReady.id); setNewContactReady(null); }
                  catch (e: any) { setMessages(m => [...m, { from: 'rex', text: e?.message ?? "Couldn't draft that text yet.", time: stamp() }]); }
                  finally { setNewContactBusy(null); }
                }} style={styles.quickContactPrimary}>
                  <Text style={styles.quickContactPrimaryText}>{newContactBusy === 'text' ? 'DRAFTING…' : '💬 DRAFT FIRST THANK-YOU'}</Text>
                </Pressable>
                <View style={styles.quickContactActions}>
                  <Pressable disabled={!!newContactBusy} onPress={async () => {
                    setNewContactBusy('sequence');
                    try { await onEnrollFreshUp?.(newContactReady.id); pushRex(`✓ ${newContactReady.name} is on Fresh Up — 14 Day.`); }
                    catch (e: any) { setMessages(m => [...m, { from: 'rex', text: e?.message ?? "Couldn't enroll that customer yet.", time: stamp() }]); }
                    finally { setNewContactBusy(null); }
                  }} style={styles.quickContactSecondary}><Text style={styles.quickContactSecondaryText}>{newContactBusy === 'sequence' ? 'ADDING…' : '＋ FRESH UP'}</Text></Pressable>
                  <Pressable disabled={!!newContactBusy} onPress={() => { onOpenContact?.(newContactReady.id); onClose(); }} style={styles.quickContactSecondary}><Text style={styles.quickContactSecondaryText}>OPEN CUSTOMER</Text></Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {parseResult ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.proposeCard}>
                <Text style={styles.proposeLabel}>{parseResult.is_new ? 'NEW CONTACT · CONFIRM TO SAVE' : 'UPDATE CONTACT · CONFIRM TO SAVE'}</Text>
                <Text style={styles.proposeText}>{(`${parseResult.first_name ?? ''} ${parseResult.last_name ?? ''}`.trim() || 'Unnamed lead')}{parseResult.vehicle ? ` · ${parseResult.vehicle}` : ''}{parseResult.phone ? ` · ${parseResult.phone}` : ''}</Text>
                {parseResult.notes ? <Text style={styles.parseNotes}>📝 {parseResult.notes}</Text> : null}
                {parseResult.plan ? <Text style={styles.parsePlan}>▶ {parseResult.plan}</Text> : null}
                {parseResult.followup_days ? <Text style={styles.parseMeta}>Follow-up in {parseResult.followup_days} day{parseResult.followup_days === 1 ? '' : 's'}</Text> : null}
                <View style={styles.proposeActions}>
                  <Pressable onPress={cancelParse} disabled={acting} style={styles.proposeCancel}><Text style={styles.proposeCancelText}>Discard</Text></Pressable>
                  <Pressable onPress={confirmParse} disabled={acting} style={styles.proposeConfirm}><Text style={styles.proposeConfirmText}>{acting ? 'Saving…' : 'Save it'}</Text></Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {mission ? (
          <View style={styles.missionBar}>
            <View style={{ flex: 1 }}><Text style={styles.missionLabel}>BUILD YOUR 60-DAY BOOK</Text><Text style={styles.missionMeta}>{mission === 'sold_book_last_month' ? 'Last month' : 'Previous month'} · {missionCount} added</Text></View>
            <Pressable onPress={() => { void onFinishMission?.(); }} disabled={missionCount === 0 || acting || typing} style={[styles.missionDone, (missionCount === 0 || acting || typing) && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel="Done, build outreach"><Text style={styles.missionDoneText}>DONE · BUILD OUTREACH</Text></Pressable>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
            {QUICK_CHIPS.map(chip => <Pressable key={chip} onPress={() => send(chip)} style={styles.chip} disabled={typing}><Text style={styles.chipText}>{chip}</Text></Pressable>)}
          </ScrollView>
        )}

        <View style={styles.inputBar}>
          <Pressable onPress={() => setParseOpen(true)} disabled={typing} style={styles.composeBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Parse a conversation"><Text style={styles.composeIcon}>🎙</Text></Pressable>
          <TextInput value={input} onChangeText={setInput} placeholder={mission ? "Name, phone, vehicle, sold timing…" : "Ask Rex anything…"} placeholderTextColor={colors.grey} style={styles.input} onSubmitEditing={() => send()} returnKeyType="send" editable={!typing} />
          <Pressable onPress={() => send()} disabled={!input.trim() || typing} style={[styles.sendBtn, (!input.trim() || typing) && { opacity: 0.5 }]}><Text style={styles.sendIcon}>➤</Text></Pressable>
        </View>
      </View>

      <ConversationComposer open={parseOpen} busy={parsing} onClose={() => setParseOpen(false)} onSubmit={runParse} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.8)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '6%', backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.goldBorder, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' } as any,
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  headerLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 1.4 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.grey2, fontSize: 14 },
  messages: { padding: 14, gap: 4 },
  bubbleRow: { flexDirection: 'row', paddingVertical: 6 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, marginTop: 4 },
  bubbleRex: { backgroundColor: colors.surface2, borderColor: colors.ink4, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.grey3, lineHeight: 20, letterSpacing: -0.15 },
  time: { fontSize: 10, color: colors.grey, marginTop: 4 },
  retryBtn: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  retryText: { fontSize: 12, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },
  quickContactCard: { width: '94%', marginTop: 4, padding: 14, borderRadius: radius.lg, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, gap: 7 },
  quickContactLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.0 },
  quickContactName: { color: colors.white, fontSize: 15, fontWeight: '800' },
  quickContactHint: { color: colors.grey3, fontSize: 11, lineHeight: 16 },
  quickContactPrimary: { minHeight: 42, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  quickContactPrimaryText: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  quickContactActions: { flexDirection: 'row', gap: 7 },
  quickContactSecondary: { flex: 1, minHeight: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  quickContactSecondaryText: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  proposeCard: { maxWidth: '92%', marginTop: 4, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  proposeLabel: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 1.0 },
  proposeText: { fontSize: 14, fontWeight: '600', color: colors.white, lineHeight: 19 },
  proposeActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  proposeCancel: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  proposeCancelText: { fontSize: 13, fontWeight: '700', color: colors.grey2 },
  proposeConfirm: { flex: 1.2, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', backgroundColor: colors.gold },
  proposeConfirmText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
  parseNotes: { fontSize: 12, color: colors.grey3, lineHeight: 17 },
  parsePlan: { fontSize: 12, color: colors.gold, lineHeight: 17, fontWeight: '600' },
  parseMeta: { fontSize: 11, color: colors.grey2, fontWeight: '600' },
  missionBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.ink2, borderTopWidth: 1, borderTopColor: colors.goldBorder },
  missionLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  missionMeta: { color: colors.white, fontSize: 12, fontWeight: '700', marginTop: 3 },
  missionDone: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.gold },
  missionDoneText: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  composeBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder },
  composeIcon: { fontSize: 18 },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, gap: 8, alignItems: 'center' },
  chip: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.full },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.gold },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'web' ? ('max(24px, env(safe-area-inset-bottom))' as any) : 24, backgroundColor: colors.ink2, borderTopWidth: 1, borderTopColor: colors.ink4 },
  input: { flex: 1, backgroundColor: colors.ink3, borderWidth: 1, borderColor: colors.ink4, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, color: colors.white, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: colors.ink, fontSize: 16, fontWeight: '800' },
});
