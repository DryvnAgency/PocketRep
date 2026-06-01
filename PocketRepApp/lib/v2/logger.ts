// Structured client logger. Centralizes app logging so failures are captured
// with consistent scope + context instead of scattered console.* calls, keeps a
// small in-memory ring buffer for an in-app debug view / bug report, and exposes
// a single sink hook for forwarding to a remote service (Sentry/Logflare) later.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  ts: string;
  level: LogLevel;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
};

const RING_MAX = 100;
const ring: LogEntry[] = [];
let sink: ((e: LogEntry) => void) | null = null;

function emit(level: LogLevel, scope: string, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = { ts: new Date().toISOString(), level, scope, message, context };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();

  const line = `[${scope}] ${message}`;
  if (level === 'error') console.error(line, context ?? '');
  else if (level === 'warn') console.warn(line, context ?? '');
  else if (level === 'info') console.info(line, context ?? '');
  else console.debug?.(line, context ?? '');

  try { sink?.(entry); } catch { /* a logging sink must never throw into callers */ }
}

export const log = {
  debug: (scope: string, message: string, context?: Record<string, unknown>) => emit('debug', scope, message, context),
  info: (scope: string, message: string, context?: Record<string, unknown>) => emit('info', scope, message, context),
  warn: (scope: string, message: string, context?: Record<string, unknown>) => emit('warn', scope, message, context),
  error: (scope: string, message: string, context?: Record<string, unknown>) => emit('error', scope, message, context),
};

// Register a remote sink (e.g. from a top-level effect). Pass null to clear.
export function setLogSink(fn: ((e: LogEntry) => void) | null): void {
  sink = fn;
}

// Snapshot of recent entries (newest last) for a debug screen / bug report.
export function recentLogs(): LogEntry[] {
  return [...ring];
}

// Normalize an unknown thrown value into a message + structured fields, so
// catch blocks can do `log.error(scope, m, describeError(e))` uniformly.
export function describeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { message: e.message, name: e.name, stack: e.stack };
  if (typeof e === 'string') return { message: e };
  try { return { message: JSON.stringify(e) }; } catch { return { message: String(e) }; }
}
