export type WebSmsRuntime = {
  userAgent?: string | null;
  platform?: string | null;
  maxTouchPoints?: number | null;
};

/**
 * Desktop browsers commonly advertise the `sms:` protocol even when they
 * cannot complete the handoff. Opening it can strand the rep behind a browser
 * protocol dialog, so only mobile web runtimes may attempt the native composer.
 */
export function isSmsCapableWebRuntime(runtime: WebSmsRuntime): boolean {
  const userAgent = runtime.userAgent ?? '';
  const platform = runtime.platform ?? '';
  const maxTouchPoints = runtime.maxTouchPoints ?? 0;

  if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(userAgent)) return true;

  // iPadOS may request desktop sites and identify itself as MacIntel.
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function isCurrentWebRuntimeSmsCapable(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isSmsCapableWebRuntime({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}
