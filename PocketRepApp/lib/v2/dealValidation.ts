export const MAX_DEAL_GROSS = 1_000_000;

export type GrossInputResult = {
  input: string;
  value: number;
  error: string | null;
};

export type ValidatableDealDraft = {
  name: string;
  stock: string;
  vehicle: string;
  date: string;
  frontGross: number;
  backGross: number;
  split: boolean;
  splitWith: string;
};

export function parseGrossInput(raw: string): GrossInputResult {
  const trimmed = raw.trim();
  if (!trimmed) return { input: '', value: 0, error: null };
  if (trimmed.includes('-')) {
    return { input: '', value: 0, error: 'Gross cannot be negative.' };
  }

  const canonical = trimmed.replace(/[$,\s]/g, '');
  if (!/^\d*(?:\.\d{0,2})?$/.test(canonical)) {
    return { input: '', value: 0, error: 'Use dollars and up to two decimal places.' };
  }

  let input = canonical.startsWith('.') ? `0${canonical}` : canonical;
  input = input.replace(/^0+(?=\d)/, '');
  if (!input || input === '.') input = '0.';

  const value = Number(input);
  if (!Number.isFinite(value)) {
    return { input: '', value: 0, error: 'Enter a valid gross amount.' };
  }
  if (value > MAX_DEAL_GROSS) {
    return {
      input: '',
      value: 0,
      error: `Gross cannot exceed $${MAX_DEAL_GROSS.toLocaleString()} per side.`,
    };
  }

  return { input, value, error: null };
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateDealDraft(draft: ValidatableDealDraft): string | null {
  if (!draft.name.trim()) return 'Enter the customer name.';
  if (!draft.stock.trim()) return 'Enter the stock number.';
  if (!draft.vehicle.trim()) return 'Enter the vehicle.';
  if (!isValidIsoDate(draft.date.trim())) return 'Use a valid delivery date in YYYY-MM-DD format.';
  if (draft.split && !draft.splitWith.trim()) return 'Enter the co-rep name for this split deal.';

  for (const [label, amount] of [
    ['Front gross', draft.frontGross],
    ['Back gross', draft.backGross],
  ] as const) {
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_DEAL_GROSS) {
      return `${label} must be between $0 and $${MAX_DEAL_GROSS.toLocaleString()}.`;
    }
  }

  if (draft.frontGross + draft.backGross <= 0) return 'Enter front gross or back gross.';
  return null;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
