import { useEffect, useRef, useState } from 'react';

// Escalating status for a long-running async call so the UI can reassure the rep
// instead of showing a bare, indefinite "thinking" state (the audit noted AI
// calls take 3-5s with only a spinner). Pass whether a call is currently active;
// the phase crosses to 'slow' after `slowAfterMs` so the view can swap in a
// "this can take a few seconds…" message.
//
// Example:
//   const phase = useSlowCallHint(loading);
//   <Text>{phase === 'slow' ? 'Still working — almost there…' : 'Thinking…'}</Text>
export type CallPhase = 'idle' | 'working' | 'slow';

export function useSlowCallHint(active: boolean, slowAfterMs = 4000): CallPhase {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!active) { setPhase('idle'); return; }
    setPhase('working');
    timer.current = setTimeout(() => setPhase('slow'), slowAfterMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active, slowAfterMs]);

  return phase;
}
