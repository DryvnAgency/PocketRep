// Shared birthday parsing/formatting. The DB column is a `date` (YYYY-MM-DD),
// but reps type MM/DD/YYYY. Keep input handling in one place so the contact
// card and the add-contact modal agree.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// YYYY-MM-DD -> "May 28, 1990"
export function formatBirthday(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[+m[2] - 1] ?? '?'} ${+m[3]}, ${m[1]}`;
}

// Accepts "MM/DD/YYYY", "M/D/YYYY" or "YYYY-MM-DD".
// Returns the normalized YYYY-MM-DD string, null to clear (empty), or false if unparseable.
export function parseBirthdayInput(s: string): string | null | false {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
  return false;
}
