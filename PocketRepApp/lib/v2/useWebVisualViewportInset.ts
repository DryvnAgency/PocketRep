import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Installed iPhone PWAs still report Platform.OS === 'web', so React Native's
 * native KeyboardAvoidingView behavior never runs there. Track Safari's visual
 * viewport instead and return the portion of the layout viewport covered by
 * the software keyboard. Consumers can lift fixed-bottom sheets by this inset
 * while leaving native builds on their normal keyboard path.
 */
export function useWebVisualViewportInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') {
      setInset(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      setInset(0);
      return;
    }

    const update = () => {
      const covered = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      // Ignore small browser-chrome/safe-area fluctuations; an iPhone software
      // keyboard produces a much larger reduction in the visual viewport.
      setInset(covered > 80 ? Math.ceil(covered) : 0);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled]);

  return inset;
}
