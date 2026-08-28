// Top-level Hey Rex controller. Owns the listener lifecycle, calls Rex for
// interpretation when a complete utterance is captured, speaks the reply
// (streaming, Siri-style), auto-runs read-only actions, and exposes the
// pending write-action so AppShell can show the confirmation sheet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createHeyRexListener,
  type RexListenerEvent,
  type RexListenerState,
} from './heyRexListener';
import {
  rexInterpret,
  executeAction,
  logRexAction,
  actionWritesData,
  failureRecoveryLine,
  type RexAction,
  type FindVehiclesPayload,
} from './rexActions';
import { isRexFailureHonestyEnabled } from './rexFeatureFlags';
import { recordRexTurn } from './rexMemory';
import {
  speak,
  speakStreaming,
  finishStreaming,
  stopSpeaking,
  isSpeaking,
} from './speech';
import type { BrainMessage } from './aiProxy';
import type { V2Contact } from './useContacts';

export type UseHeyRexInput = {
  enabled: boolean;
  contacts: V2Contact[];
  tagNames: string[];
  // Lets auto-run open a contact card directly (show_contact / call_next).
  onOpenContact?: (id: string) => void;
  // Vehicle Finder pivot: auto-run hands the extracted requirements up so
  // AppShell opens VehicleFinderModal. AppShell only passes this when
  // EXPO_PUBLIC_VEHICLE_FINDER is on, so flag-off makes find_vehicles a no-op.
  onFindVehicles?: (payload: FindVehiclesPayload) => void;
  // P2-R2: screen/state awareness — the tab the rep is on + the contact they
  // have open, so Rex can resolve "this one" / "log a deal on her" in context.
  activeScreen?: string;
  selectedContactId?: string | null;
};

export type UseHeyRexOutput = {
  state: RexListenerState;
  partial: string;
  thinking: boolean;
  streamingSay: string;
  speaking: boolean;
  action: RexAction | null;
  executing: boolean;
  error: string | null;
  filteredIds: string[] | null;
  confirm: () => Promise<{ openContactId?: string; filteredIds?: string[] } | null>;
  cancel: () => void;
  dismissFiltered: () => void;
};

// Defense-in-depth watchdog. callBrainStream only has a 20s *idle* timeout (it
// resets on every chunk), so a steadily-streaming reply can outlive it — this
// wall-clock cap is what guarantees the UI never hangs in "thinking".
const PROCESS_TIMEOUT_MS = 25_000;
// How long a read-only result stays up before we auto-dismiss + re-arm.
const NAV_DISMISS_MS = 2_200;     // show_contact / call_next — card is the result
const INFO_DISMISS_MS = 9_000;    // book_summary / filter_contacts / say — readable
const CLARIFY_DISMISS_MS = 15_000; // safety net if the rep never answers

// P2-R8: surface a failed action honestly + log it with its reason. The failure
// reason always goes to rex_action_log (invisible audit). When the failure-honesty
// flag is on, Rex SPEAKS a specific recovery line — correcting the optimistic
// pre-execution "done" the rep already heard — and shows it; when off, behavior is
// unchanged (the raw error text, no extra speech). A chain that fails is logged
// 'partial' (it may have applied some steps) rather than a flat 'failed'.
function reportActionFailure(action: RexAction, e: any, setError: (s: string) => void, fallbackMsg: string): void {
  const reason: string | undefined = e?.message;
  if (isRexFailureHonestyEnabled()) {
    const line = failureRecoveryLine(action);
    setError(line);
    speak(line); // verbally correct the optimistic confirmation
  } else {
    setError(reason ?? fallbackMsg);
  }
  const result = action.type === 'chain' ? 'partial' : 'failed';
  logRexAction(action, result, reason ? { failure_reason: reason } : undefined).catch(() => undefined);
}

export function useHeyRex(input: UseHeyRexInput): UseHeyRexOutput {
  const [state, setState] = useState<RexListenerState>('idle');
  const [partial, setPartial] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streamingSay, setStreamingSay] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [action, setAction] = useState<RexAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);

  const listenerRef = useRef<ReturnType<typeof createHeyRexListener> | null>(null);
  const lastUtteranceRef = useRef<string>('');
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convoRef = useRef<BrainMessage[]>([]); // in-session multi-turn context
  const turnAbortRef = useRef<AbortController | null>(null); // in-flight rexInterpret

  // Keep the latest data in refs so the listener callback (created once) can
  // always see fresh values without needing to be torn down on every render.
  const contactsRef = useRef(input.contacts);
  const tagsRef = useRef(input.tagNames);
  const onOpenRef = useRef(input.onOpenContact);
  const onFindVehiclesRef = useRef(input.onFindVehicles);
  const activeScreenRef = useRef(input.activeScreen);
  const selectedContactIdRef = useRef(input.selectedContactId);
  useEffect(() => { contactsRef.current = input.contacts; }, [input.contacts]);
  useEffect(() => { tagsRef.current = input.tagNames; }, [input.tagNames]);
  useEffect(() => { onOpenRef.current = input.onOpenContact; }, [input.onOpenContact]);
  useEffect(() => { onFindVehiclesRef.current = input.onFindVehicles; }, [input.onFindVehicles]);
  useEffect(() => { activeScreenRef.current = input.activeScreen; }, [input.activeScreen]);
  useEffect(() => { selectedContactIdRef.current = input.selectedContactId; }, [input.selectedContactId]);

  const clearWatchdog = () => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
  };
  const clearDismiss = () => {
    if (dismissRef.current) { clearTimeout(dismissRef.current); dismissRef.current = null; }
  };
  // Abort the in-flight turn so its promise can't resolve late and pop a stale
  // action (after a timeout, a ✕ cancel, or a new utterance superseding it).
  const abortTurn = () => {
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
  };

  // Mirror the actual SpeechSynthesis queue into `speaking` so the orb can show
  // a distinct talking state (and so the waveform stops when Rex stops).
  useEffect(() => {
    if (Platform.OS !== 'web' || !input.enabled) { setSpeaking(false); return; }
    const id = setInterval(() => setSpeaking(isSpeaking()), 250);
    return () => clearInterval(id);
  }, [input.enabled]);

  // Voice-path errors auto-clear so a transient blip doesn't pin the sheet open.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6_000);
    return () => clearTimeout(id);
  }, [error]);

  useEffect(() => {
    if (!input.enabled) {
      listenerRef.current?.stop();
      listenerRef.current = null;
      stopSpeaking();
      clearWatchdog();
      clearDismiss();
      setState('idle');
      return;
    }

    // Auto-dismiss a read-only result, then re-open the mic for a hands-free
    // follow-up (silence falls back to idle wake-word scanning on its own).
    const scheduleAutoDismiss = (act: RexAction) => {
      clearDismiss();
      const navigates = act.type === 'show_contact' || act.type === 'call_next' || act.type === 'find_vehicles';
      const ms = navigates ? NAV_DISMISS_MS : INFO_DISMISS_MS;
      dismissRef.current = setTimeout(() => {
        setAction(null);
        setStreamingSay('');
        setPartial('');
        listenerRef.current?.resume({ awake: !navigates });
      }, ms);
    };

    // Read-only action → run it now (no Confirm tap), surface side-effects.
    const autoRunSafe = async (act: RexAction) => {
      try {
        const result = await executeAction(act, contactsRef.current);
        if (result.openContactId) onOpenRef.current?.(result.openContactId);
        if (result.filteredIds && result.filteredIds.length > 0) setFilteredIds(result.filteredIds);
        // Vehicle-finder pivot: the modal is the result. onFindVehicles is only
        // wired when EXPO_PUBLIC_VEHICLE_FINDER is on, so this is a no-op off.
        if (act.type === 'find_vehicles') onFindVehiclesRef.current?.(act.payload);
        recordRexTurn(lastUtteranceRef.current, act.say || '(no spoken reply)', result.openContactId)
          .catch(() => undefined);
        logRexAction(act, 'success').catch(() => undefined);
      } catch (e: any) {
        // Even "safe" actions can fail (e.g. a Supabase read) — surface it
        // honestly instead of silently doing nothing (P2-R8).
        reportActionFailure(act, e, setError, 'Something went wrong');
      }
      scheduleAutoDismiss(act);
    };

    const handleActionArrived = (act: RexAction) => {
      if (actionWritesData(act.type)) {
        // Write action → keep the Confirm card; AppShell.handleRexConfirm runs
        // the execution (+ downstream overlays) when the rep taps Confirm.
        return;
      }
      if (act.type === 'clarify') {
        // Keep the question up and re-open the mic so the rep just answers.
        listenerRef.current?.resume({ awake: true });
        clearDismiss();
        dismissRef.current = setTimeout(() => {
          setAction(null);
          setStreamingSay('');
          setPartial('');
          listenerRef.current?.resume();
        }, CLARIFY_DISMISS_MS);
        return;
      }
      autoRunSafe(act);
    };

    const runTurn = (text: string) => {
      abortTurn(); // a new utterance supersedes any still-in-flight turn
      clearDismiss();
      clearWatchdog();
      stopSpeaking(); // reset the streaming-speech cursor for the new reply
      setThinking(true);
      setError(null);
      setAction(null);
      setStreamingSay('');
      lastUtteranceRef.current = text;
      convoRef.current.push({ role: 'user', content: text });

      const ctrl = new AbortController();
      turnAbortRef.current = ctrl;

      watchdogRef.current = setTimeout(() => {
        ctrl.abort(); // stop the request so it can't resolve and speak late
        setThinking(false);
        setError('Rex took too long — try again.');
        listenerRef.current?.resume();
      }, PROCESS_TIMEOUT_MS);

      rexInterpret(text, contactsRef.current, tagsRef.current, {
        recentTurns: convoRef.current.slice(-6),
        signal: ctrl.signal,
        activeScreen: activeScreenRef.current,
        selectedContactId: selectedContactIdRef.current,
        onSayDelta: (spoken) => {
          if (ctrl.signal.aborted) return; // don't voice a superseded turn
          setStreamingSay(spoken);
          speakStreaming(spoken); // enqueue completed sentences as they land
        },
      })
        .then((act) => {
          if (ctrl.signal.aborted) return; // timed out / cancelled / superseded
          clearWatchdog();
          turnAbortRef.current = null;
          finishStreaming(act.say ?? ''); // flush any trailing fragment
          setSpeaking(true);
          convoRef.current.push({ role: 'assistant', content: act.say || '(no spoken reply)' });
          setThinking(false);
          setAction(act);
          handleActionArrived(act);
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return; // we aborted on purpose — stay quiet
          clearWatchdog();
          turnAbortRef.current = null;
          setThinking(false);
          setError(err?.message ?? 'Rex is unreachable');
          listenerRef.current?.resume();
        });
    };

    const handle = (e: RexListenerEvent) => {
      switch (e.type) {
        case 'state':
          setState(e.state);
          if (e.state === 'idle' || e.state === 'awake') setPartial('');
          break;
        case 'wake':
          // Real wake word → barge-in: stop Rex talking and start fresh.
          stopSpeaking();
          clearDismiss();
          setError(null);
          setAction(null);
          setStreamingSay('');
          setPartial(e.afterText);
          if (Platform.OS === 'web') { try { (navigator as any).vibrate?.(8); } catch { /* no haptics */ } }
          break;
        case 'partial':
          stopSpeaking(); // the rep is speaking — don't talk over them
          setPartial(e.text);
          break;
        case 'utterance':
          runTurn(e.text);
          break;
        case 'error':
          setError(e.message);
          break;
      }
    };

    const listener = createHeyRexListener({ onEvent: handle, silenceMs: 4000 });
    listenerRef.current = listener;
    listener.start();

    return () => {
      listener.stop();
      stopSpeaking();
      clearWatchdog();
      clearDismiss();
      abortTurn(); // don't let a late resolve setState after unmount
    };
  }, [input.enabled]);

  const cancel = useCallback(() => {
    if (action) logRexAction(action, 'cancelled').catch(() => undefined);
    abortTurn(); // drop any in-flight request so it can't pop a stale action
    clearDismiss();
    clearWatchdog();
    stopSpeaking();
    setAction(null);
    setThinking(false);
    setExecuting(false);
    setError(null);
    setPartial('');
    setStreamingSay('');
    listenerRef.current?.resume();
  }, [action]);

  const dismissFiltered = useCallback(() => {
    setFilteredIds(null);
  }, []);

  const confirm = useCallback(async (): Promise<{ openContactId?: string; filteredIds?: string[] } | null> => {
    if (!action) return null;
    clearDismiss();
    stopSpeaking();
    setExecuting(true);
    setError(null);
    try {
      const result = await executeAction(action, contactsRef.current);
      const opened = result.openContactId;
      const filtered = result.filteredIds;
      recordRexTurn(
        lastUtteranceRef.current,
        action.say || '(no spoken reply)',
        opened,
      ).catch(() => undefined);
      logRexAction(action, 'success').catch(() => undefined);
      setAction(null);
      setExecuting(false);
      setPartial('');
      setStreamingSay('');
      if (filtered && filtered.length > 0) setFilteredIds(filtered);
      // Multi-turn: re-open the mic after a write too ("...and his number is").
      listenerRef.current?.resume({ awake: true });
      return (opened || filtered) ? { openContactId: opened, filteredIds: filtered } : null;
    } catch (e: any) {
      // P2-R8: Rex already spoke its optimistic confirmation — correct it honestly
      // (and log why it failed) rather than leaving a fabricated "done" standing.
      reportActionFailure(action, e, setError, 'Save failed');
      setExecuting(false);
      return null;
    }
  }, [action]);

  return {
    state, partial, thinking, streamingSay, speaking, action, executing, error,
    filteredIds, confirm, cancel, dismissFiltered,
  };
}
