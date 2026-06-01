// Shared formatting + input-normalization helpers, so currency renders the same
// way everywhere (the audit found "$0.0K" next to "$1,100") and user-entered
// names/vehicles get title-cased + trimmed on save.

// Whole-dollar currency with thousands separators: 1100 -> "$1,100", 0 -> "$0",
// -250 -> "-$250". Non-finite -> "$0". Use for headline amounts.
export function formatMoney(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
}

// Compact currency for tight stat tiles: 0 -> "$0", 950 -> "$950",
// 1100 -> "$1.1K", 1_200_000 -> "$1.2M". Drops a trailing ".0". Use only where
// space is constrained; everything else should use formatMoney.
export function formatMoneyCompact(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${trimDot(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trimDot(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

function trimDot(x: number): string {
  return x.toFixed(1).replace(/\.0$/, '');
}

// Capitalize the first letter of each word without lowercasing the rest, so
// "lalo ponce" -> "Lalo Ponce" while preserving intentional caps (McLaren, SL).
// Trims and collapses internal whitespace. (Moved from updateContact.ts.)
export function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

// Normalizers for the values the audit flagged ("pathfindder" / "blue sl"):
// title-case + trim on save. (Spelling is left to the user.)
export const normalizeName = (s: string): string => titleCase(s);
export const normalizeVehicle = (s: string): string => titleCase(s);
