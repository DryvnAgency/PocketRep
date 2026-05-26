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
  type RexAction,
} from './rexActions';
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
  confirm: () => Promise<{ openContactId?: string } | null>;
  cancel: () => void;
};

export function useHeyRex(input: UseHeyRexInput): UseHeyRexOutput {
  const [state, setState] = useState<RexListenerState>('idle');
  const [partial, setPartial] = useState('');
  const [thinking, setThinking] = useState(false);
  const [action, setAction] = useState<RexAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenerRef = useRef<ReturnType<typeof createHeyRexListener> | null>(null);

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
    setAction(null);
    setThinking(false);
    setExecuting(false);
    setError(null);
    setPartial('');
    listenerRef.current?.resume();
  }, []);

  const confirm = useCallback(async (): Promise<{ openContactId?: string } | null> => {
    if (!action) return null;
    setExecuting(true);
    setError(null);
    try {
      const result = await executeAction(action);
      const opened = result.openContactId;
      setAction(null);
      setExecuting(false);
      setPartial('');
      listenerRef.current?.resume();
      return opened ? { openContactId: opened } : null;
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
      setExecuting(false);
      return null;
    }
  }, [action]);

  return { state, partial, thinking, action, executing, error, confirm, cancel };
}
