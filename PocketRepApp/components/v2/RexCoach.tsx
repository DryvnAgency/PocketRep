// Rex Coach — the tap-to-open text coaching chat (ported from
// design/extracted/tab-rex.jsx "Coach Mode"). This is the ONLY thing the gold
// orb opens. It's conversational coaching only: ask for scripts, rebuttals,
// objection role-play, next-move ideas. It never writes to the database —
// taking actions (add contact, log deal, etc.) is reserved for "Hey Rex" voice.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
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
  parseCoachReply, executeAction, summarizeAction, type RexAction,
} from '@/lib/v2/rexActions';
import { extractFromConversation, type ConversationParse } from '@/lib/v2/conversationParse';
import { getTodayLog, getCarrySummary, appendCoachEntry } from '@/lib/v2/coachLog';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { PayPlan } from '@/lib/v2/payPlan';

// The coach may emit these (write) actions; delete/batch stay voice/UI-only.
// find_vehicles (read-only pivot) joins the list only when its flag is on — off
// → the model isn't taught the action and the set is unchanged, so a stray
// find_vehicles degrades to plain text like any non-allowed action.
const COACH_ACTIONS = new Set<RexAction['type']>([
  'add_contact', 'update_notes', 'schedule_followup', 'retier_contact', 'log_deal', 'create_reminder',
  ...(isVehicleFinderEnabled() ? (['find_vehicles'] as RexAction['type'][]) : []),
]);

// Rex chat v2 (EXPO_PUBLIC_REX_CHAT): closer persona + token streaming + durable
// cross-device thread. Build-time env, so this is constant for the app's life;
// OFF → every path below behaves byte-identically to before.
const REX_CHAT = isRexChatEnabled();

// P3-A1: the two-pass planner→executor triad. Requires REX_CHAT (it upgrades the
// same chat path) AND its own flag. Build-time constant → OFF makes deliver()
// take the exact single-call path it takes today.
const TRIAD = REX_CHAT && isRexTriadEnabled();

type ChatMessage = { from: 'rex' | 'user'; text: string; time: string };

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
}: {
  open: boolean;
  onClose: () => void;
  contacts: V2Contact[];
  payPlan: PayPlan | null;
  // Fired after a confirmed action executes so AppShell can refresh the right
  // surface (contacts / deals / notifications) — mirrors handleRexConfirm.
  onActed?: (action: RexAction) => void;
  onOpenContact?: (id: string) => void;
}) {
  const greeting = useRef(COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  // Cold-start UX: after ~5s of waiting we tell the rep the function is warming;
  // on a transient failure we keep the text so a Retry button can re-send it.
  const [warming, setWarming] = useState(false);
  const [retry, setRetry] = useState<{ text: string; history: ChatMessage[] } | null>(null);
  const [mtd, setMtd] = useState<MtdSummary | null>(null);
  const [activity, setActivity] = useState('');           // recent-activity recall block
  const [pending, setPending] = useState<RexAction | null>(null); // proposed write action
  const [acting, setActing] = useState(false);            // executing a confirmed action
  const [parseOpen, setParseOpen] = useState(false);      // conversation composer (NEW 5)
  const [parsing, setParsing] = useState(false);          // extraction in flight
  const [parseResult, setParseResult] = useState<ConversationParse | null>(null);
  // Rex chat v2: the in-flight streamed reply (null = not streaming), who Rex
  // works for, and whether the rep has interacted since open (guards the async
  // server-thread restore from clobbering a conversation already in progress).
  const [streamText, setStreamText] = useState<string | null>(null);
  const repIdent = useRef<RepIdentity>({});
  const interactedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // Seed a fresh greeting each time the sheet opens, and refresh month-to-date
  // numbers so coaching reflects the rep's current standing.
  useEffect(() => {
    if (open) {
      greeting.current = COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)];
      // NEW 6: restore today's logged thread; carry yesterday's recap on top.
      // A fresh day (no entries) just shows the recap + greeting.
      const carry = getCarrySummary();
      const today = getTodayLog();
      const seeded: ChatMessage[] = [];
      if (carry) seeded.push({ from: 'rex', text: `↺ Yesterday — ${carry}`, time: stamp() });
      if (today.length > 0) {
        for (const e of today) seeded.push({ from: e.role, text: e.text, time: e.time });
      } else {
        seeded.push({ from: 'rex', text: greeting.current, time: stamp() });
      }
      setMessages(seeded);
      setInput('');
      setTyping(false);
      setWarming(false);
      setRetry(null);
      setPending(null);
      setActing(false);
      setParseOpen(false);
      setParsing(false);
      setParseResult(null);
      setStreamText(null);
      interactedRef.current = false;
      // Warm the brain function while the rep reads the greeting + types, so the
      // first real send lands on a warm container instead of a cold start.
      warmBrain();
      loadMtdSummary().then(setMtd).catch(() => setMtd(null));
      loadRecentActivity().then(setActivity).catch(() => setActivity(''));
      if (REX_CHAT) {
        // Who Rex works for (best-effort; prompt falls back to demo defaults).
        loadRepIdentity().then(r => { repIdent.current = r; }).catch(() => undefined);
        // Durable thread: today's turns from rex_messages beat the local cache —
        // but never clobber a conversation the rep has already started here.
        loadTodayServerThread().then(rows => {
          if (!rows || rows.length === 0 || interactedRef.current) return;
          // Staleness guard: recordRexTurn is fire-and-forget, so a SELECT can
          // beat the INSERT on a quick reopen. Only replace the local log when
          // the server genuinely knows MORE than this device does.
          if (rows.length <= today.length) return;
          const restored: ChatMessage[] = [];
          if (carry) restored.push({ from: 'rex', text: `↺ Yesterday — ${carry}`, time: stamp() });
          for (const t of rows) restored.push({ from: t.from, text: t.text, time: t.time });
          setMessages(restored);
        }).catch(() => undefined);
      }
    }
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, typing, streamText, open]);

  if (!open) return null;

  // Append to the visible thread AND persist to today's coach log (NEW 6), so
  // the day's real turns/actions survive a reopen. Transient system bubbles
  // (errors, warming, cancels) stay setMessages-only and aren't logged.
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
    interactedRef.current = true; // a live conversation beats the async restore
    setRetry(null);
    setPending(null); // a new message supersedes any un-confirmed proposal
    const history = messages;
    pushUser(text);
    setInput('');
    await deliver(text, history);
  };

  // Runs one coach turn with cold-start resilience: flips to a "warming up" hint
  // after 5s, and on a transient (timeout/network) failure warms the function and
  // retries once — the retry lands on the now-warm container. On final failure it
  // stores the turn so the Retry button can re-send it.
  const deliver = async (text: string, history: ChatMessage[]) => {
    setTyping(true);
    setWarming(false);
    const warmTimer = setTimeout(() => setWarming(true), 5_000);
    const repContext = serializeRepContext({ contacts, payPlan, mtd });
    let attempt = 0;
    // P3-A1: flips to false only if the planner returns an unusable plan, so this
    // turn falls back to the single call without a hard error. Transient failures
    // keep TRIAD on and re-run the two-pass path on the warm retry.
    let useTriad = TRIAD;
    try {
      for (;;) {
        try {
          // P3-A1 triad: PLANNER (diagnose → JSON plan) then EXECUTOR (stream the
          // words). Only a plan-parse miss falls through to the single call below;
          // transient errors rethrow into the same warm-and-retry loop as always.
          if (useTriad) {
            try {
              const { reply, action } = await runTriadCoach({
                planner: {
                  history, text, repContext,
                  contacts: contacts.map(c => ({ id: c.id, name: c.name, days: c.days })),
                  recentActivity: activity,
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
              recordRexTurn(text, line).catch(() => undefined);
              return;
            } catch (e: any) {
              // A bad/unparseable plan is not worth erroring on — quietly use the
              // single-call path this same attempt. Anything else (timeout,
              // network, empty) propagates to the transient handler below.
              if (!String(e?.message ?? '').includes('triad plan')) throw e;
              useTriad = false;
              setStreamText(null);
            }
          }

          // 1200 (was 700) so a complete, structured coaching answer never gets
          // cut off mid-sentence — the prompt still asks Rex to stay tight.
          const brainOpts = {
            maxTokens: 1200,
            messages: buildCoachMessages({
              history, text, repContext,
              contacts: contacts.map(c => ({ id: c.id, name: c.name, days: c.days })),
              recentActivity: activity,
              rep: REX_CHAT ? repIdent.current : undefined,
            }),
          };
          // Rex chat v2 streams tokens into a live bubble; the visible stream
          // stops at the first fenced block so a trailing action JSON never
          // flashes on screen. Flag off → the original one-shot call, untouched.
          const reply = REX_CHAT
            ? (await callBrainStream({
                ...brainOpts,
                // Parity with callBrain's total budget: the stream path's idle
                // timer resets per chunk, but the non-SSE JSON fallback needs
                // the full 60s (cold starts run 30-60s).
                timeoutMs: 60_000,
                // Trim a partially-arrived fence so 1-2 backticks never flash.
                onDelta: (full) => setStreamText(full.split('```')[0].replace(/`{1,2}\s*$/, '')),
              })).trim()
            : (await callBrain(brainOpts)).trim();
          if (!reply) throw new Error('empty');
          // The reply is coaching text, optionally followed by a structured
          // action when the rep asked Rex to DO something. Show the spoken line;
          // if an allowed write-action came back, queue the Confirm card.
          const { spoken, action } = parseCoachReply(reply);
          const actionable = !!action && COACH_ACTIONS.has(action.type);
          const line = spoken || (actionable ? summarizeAction(action!) : reply);
          setStreamText(null); // the final bubble replaces the stream
          pushRex(line);
          if (actionable) setPending(action!);
          // Durable thread: mirror the exchange into rex_messages (fire-and-
          // forget; also feeds the rolling rex_memory summary shared with voice).
          if (REX_CHAT) recordRexTurn(text, line).catch(() => undefined);
          return;
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          const transient = msg.includes('timeout') || msg.includes('network');
          if (attempt === 0 && transient) {
            attempt++;
            setWarming(true);
            setStreamText(null); // clear the frozen partial so the warming hint shows
            await warmBrain();   // boot the container, then retry once
            continue;
          }
          throw e;
        }
      }
    } catch {
      setMessages(m => [...m, {
        from: 'rex',
        text: "Couldn't reach Rex just now — the assistant may be waking up. Tap Retry.",
        time: stamp(),
      }]);
      setRetry({ text, history });
    } finally {
      clearTimeout(warmTimer);
      setWarming(false);
      setTyping(false);
      setStreamText(null); // clear any partial stream on success OR failure
    }
  };

  const doRetry = () => {
    if (!retry || typing) return;
    const r = retry;
    setRetry(null);
    deliver(r.text, r.history);
  };

  // Confirm-before-write: the proposed action only executes here, on an explicit
  // tap. Reuses the exact engine the voice path uses (executeAction).
  const confirmAction = async () => {
    if (!pending || acting) return;
    const action = pending;
    setActing(true);
    try {
      const result = await executeAction(action, contacts);
      pushRex(`✓ Done — ${summarizeAction(action)}`);
      onActed?.(action);
      if (result.openContactId) onOpenContact?.(result.openContactId);
      setPending(null);
    } catch (e: any) {
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

  // NEW 5 — parse a whole conversation into a proposed CRM update (extraction is
  // read-only; the write still waits for Confirm below).
  const runParse = async (transcript: string) => {
    interactedRef.current = true; // a parse in progress beats the async restore
    setParseOpen(false);
    setPending(null);
    setParseResult(null);
    pushUser(`🎙 Parse this conversation (${transcript.length} chars)`);
    setParsing(true);
    setTyping(true);
    setWarming(false);
    const warmTimer = setTimeout(() => setWarming(true), 5_000);
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
      clearTimeout(warmTimer);
      setWarming(false);
      setParsing(false);
      setTyping(false);
    }
  };

  // Confirm the parse: add (or update) the contact, then optionally set the
  // suggested follow-up. Reuses executeAction for each write.
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
        contactId = res.openContactId ?? null;
        onActed?.(add);
      } else {
        const upd: RexAction = {
          type: 'update_notes', say: '',
          payload: { contact_id: contactId, contact_name: name, notes_append: r.notes },
        };
        await executeAction(upd, contacts);
        onActed?.(upd);
      }
      if (contactId && r.followup_days && r.followup_days > 0) {
        const fu: RexAction = {
          type: 'schedule_followup', say: '',
          payload: { contact_id: contactId, contact_name: name, days_from_now: r.followup_days, note: r.plan },
        };
        await executeAction(fu, contacts);
        onActed?.(fu);
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
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.live} />
          <Text style={styles.headerLabel}>REX · COACH</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={6}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messages}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubbleRow, { justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }]}
            >
              <View style={{ maxWidth: '84%' }}>
                {m.from === 'rex' ? <Label color={colors.gold}>REX · COACH</Label> : null}
                <View style={[styles.bubble, m.from === 'user' ? styles.bubbleUser : styles.bubbleRex]}>
                  <Text style={[styles.bubbleText, m.from === 'user' && { color: colors.white }]}>
                    {m.text}
                  </Text>
                </View>
                <Text style={[styles.time, { textAlign: m.from === 'user' ? 'right' : 'left' }]}>{m.time}</Text>
              </View>
            </View>
          ))}
          {streamText ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={{ maxWidth: '84%' }}>
                <Label color={colors.gold}>REX · COACH</Label>
                <View style={[styles.bubble, styles.bubbleRex]}>
                  <Text style={styles.bubbleText}>{streamText}</Text>
                </View>
              </View>
            </View>
          ) : null}
          {typing && !streamText ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, styles.bubbleRex, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <RadarLoader size={16} />
                <Text style={styles.bubbleText}>
                  {warming ? 'Warming up — first reply can take a few seconds…' : 'Rex is thinking…'}
                </Text>
              </View>
            </View>
          ) : null}
          {retry && !typing ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <Pressable onPress={doRetry} style={styles.retryBtn}>
                <Text style={styles.retryText}>↻ Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {pending ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.proposeCard}>
                <Text style={styles.proposeLabel}>PROPOSED · CONFIRM TO SAVE</Text>
                <Text style={styles.proposeText}>{summarizeAction(pending)}</Text>
                <View style={styles.proposeActions}>
                  <Pressable onPress={cancelAction} disabled={acting} style={styles.proposeCancel}>
                    <Text style={styles.proposeCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={confirmAction} disabled={acting} style={styles.proposeConfirm}>
                    <Text style={styles.proposeConfirmText}>{acting ? 'Saving…' : 'Confirm'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {parseResult ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.proposeCard}>
                <Text style={styles.proposeLabel}>
                  {parseResult.is_new ? 'NEW CONTACT · CONFIRM TO SAVE' : 'UPDATE CONTACT · CONFIRM TO SAVE'}
                </Text>
                <Text style={styles.proposeText}>
                  {(`${parseResult.first_name ?? ''} ${parseResult.last_name ?? ''}`.trim() || 'Unnamed lead')}
                  {parseResult.vehicle ? ` · ${parseResult.vehicle}` : ''}
                  {parseResult.phone ? ` · ${parseResult.phone}` : ''}
                </Text>
                {parseResult.notes ? <Text style={styles.parseNotes}>📝 {parseResult.notes}</Text> : null}
                {parseResult.plan ? <Text style={styles.parsePlan}>▶ {parseResult.plan}</Text> : null}
                {parseResult.followup_days ? (
                  <Text style={styles.parseMeta}>
                    Follow-up in {parseResult.followup_days} day{parseResult.followup_days === 1 ? '' : 's'}
                  </Text>
                ) : null}
                <View style={styles.proposeActions}>
                  <Pressable onPress={cancelParse} disabled={acting} style={styles.proposeCancel}>
                    <Text style={styles.proposeCancelText}>Discard</Text>
                  </Pressable>
                  <Pressable onPress={confirmParse} disabled={acting} style={styles.proposeConfirm}>
                    <Text style={styles.proposeConfirmText}>{acting ? 'Saving…' : 'Save it'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
        >
          {QUICK_CHIPS.map(chip => (
            <Pressable key={chip} onPress={() => send(chip)} style={styles.chip} disabled={typing}>
              <Text style={styles.chipText}>{chip}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <Pressable
            onPress={() => setParseOpen(true)}
            disabled={typing}
            style={styles.composeBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Parse a conversation"
          >
            <Text style={styles.composeIcon}>🎙</Text>
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Rex anything…"
            placeholderTextColor={colors.grey}
            style={styles.input}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!typing}
          />
          <Pressable
            onPress={() => send()}
            disabled={!input.trim() || typing}
            style={[styles.sendBtn, (!input.trim() || typing) && { opacity: 0.5 }]}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </View>

      <ConversationComposer
        open={parseOpen}
        busy={parsing}
        onClose={() => setParseOpen(false)}
        onSubmit={runParse}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.8)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '6%',
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.ink2,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  live: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.green,
  },
  headerLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 1.4 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.grey2, fontSize: 14 },

  messages: { padding: 14, gap: 4 },
  bubbleRow: { flexDirection: 'row', paddingVertical: 6 },
  bubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  bubbleRex: { backgroundColor: colors.surface2, borderColor: colors.ink4, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.grey3, lineHeight: 20, letterSpacing: -0.15 },
  time: { fontSize: 10, color: colors.grey, marginTop: 4 },

  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  retryText: { fontSize: 12, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },

  proposeCard: {
    maxWidth: '92%',
    marginTop: 4,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 8,
  },
  proposeLabel: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 1.0 },
  proposeText: { fontSize: 14, fontWeight: '600', color: colors.white, lineHeight: 19 },
  proposeActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  proposeCancel: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
  },
  proposeCancelText: { fontSize: 13, fontWeight: '700', color: colors.grey2 },
  proposeConfirm: {
    flex: 1.2, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.gold,
  },
  proposeConfirmText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
  parseNotes: { fontSize: 12, color: colors.grey3, lineHeight: 17 },
  parsePlan: { fontSize: 12, color: colors.gold, lineHeight: 17, fontWeight: '600' },
  parseMeta: { fontSize: 11, color: colors.grey2, fontWeight: '600' },

  composeBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  composeIcon: { fontSize: 18 },

  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, gap: 8, alignItems: 'center' },
  chip: {
    alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.gold },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
  },
  input: {
    flex: 1,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11,
    color: colors.white, fontSize: 14,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { color: colors.ink, fontSize: 16, fontWeight: '800' },
});
