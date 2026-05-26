// Top-level Hey Rex controller. Owns the listener lifecycle, calls Rex for
// interpretation when a complete utterance is captured, and exposes the
// pending action so AppShell can show the confirmation sheet.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createHeyRexListener,
  type RexListenerEvent,
  type RexListenerState,
} from './heyRexListener';
import {
  rexInterpret,
  executeAction,
  logRexAction,
  type RexAction,
} from './rexActions';
import { recordRexTurn } from './rexMemory';
import type { V2Contact } from './useContacts';

export type UseHeyRexInput = {
  enabled: boolean;
  contacts: V2Contact[];
  tagNames: string[];
};

export type UseHeyRexOutput = {
  state: RexListenerState;
  partial: string;
  thinking: boolean;
  action: RexAction | null;
  executing: boolean;
  error: string | null;
  filteredIds: string[] | null;
  confirm: () => Promise<{ openContactId?: string; filteredIds?: string[] } | null>;
  cancel: () => void;
  dismissFiltered: () => void;
};

export function useHeyRex(input: UseHeyRexInput): UseHeyRexOutput {
  const [state, setState] = useState<RexListenerState>('idle');
  const [partial, setPartial] = useState('');
  const [thinking, setThinking] = useState(false);
  const [action, setAction] = useState<RexAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const listenerRef = useRef<ReturnType<typeof createHeyRexListener> | null>(null);
  const lastUtteranceRef = useRef<string>('');

  // Keep the latest data in refs so the listener callback (created once) can
  // always see fresh values without needing to be torn down on every render.
  const contactsRef = useRef(input.contacts);
  const tagsRef = useRef(input.tagNames);
  useEffect(() => { contactsRef.current = input.contacts; }, [input.contacts]);
  useEffect(() => { tagsRef.current = input.tagNames; }, [input.tagNames]);

  useEffect(() => {
    if (!input.enabled) {
      listenerRef.current?.stop();
      listenerRef.current = null;
      setState('idle');
      return;
    }

    const handle = (e: RexListenerEvent) => {
      switch (e.type) {
        case 'state':
          setState(e.state);
          if (e.state === 'idle') setPartial('');
          break;
        case 'wake':
          setError(null);
          setPartial(e.afterText);
          break;
        case 'partial':
          setPartial(e.text);
          break;
        case 'utterance': {
          setThinking(true);
          setError(null);
          lastUtteranceRef.current = e.text;
          rexInterpret(e.text, contactsRef.current, tagsRef.current)
            .then((act) => {
              setAction(act);
            })
            .catch((err) => {
              setError(err?.message ?? 'Rex is unreachable');
            })
            .finally(() => setThinking(false));
          break;
        }
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
    };
  }, [input.enabled]);

  const cancel = useCallback(() => {
    if (action) logRexAction(action, 'cancelled').catch(() => undefined);
    setAction(null);
    setThinking(false);
    setExecuting(false);
    setError(null);
    setPartial('');
    listenerRef.current?.resume();
  }, [action]);

  const dismissFiltered = useCallback(() => {
    setFilteredIds(null);
  }, []);

  const confirm = useCallback(async (): Promise<{ openContactId?: string; filteredIds?: string[] } | null> => {
    if (!action) return null;
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
      if (filtered && filtered.length > 0) setFilteredIds(filtered);
      listenerRef.current?.resume();
      return (opened || filtered) ? { openContactId: opened, filteredIds: filtered } : null;
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
      setExecuting(false);
      logRexAction(action, 'failed').catch(() => undefined);
      return null;
    }
  }, [action]);

  return { state, partial, thinking, action, executing, error, filteredIds, confirm, cancel, dismissFiltered };
}
