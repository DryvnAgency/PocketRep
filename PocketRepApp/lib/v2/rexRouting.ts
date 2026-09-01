// Deterministic Rex model router. Model choice is an implementation detail:
// PocketRep decides the workload from known product state, then asks the proxy
// for Flash or Pro. Rex never spends a model call deciding which model to use.

export type BrainTier = 'flash' | 'pro';

export type RexWorkload =
  | 'routine'
  | 'customer_draft'
  | 'structured_action'
  | 'memory_compaction'
  | 'weekly_coach'
  | 'whole_book'
  | 'complex_strategy'
  | 'repair';

const PRO_WORKLOADS = new Set<RexWorkload>([
  'weekly_coach',
  'whole_book',
  'complex_strategy',
  'repair',
]);

// These phrases represent an explicitly broad or contradictory request. Normal
// objections, appointment copy, lease-vs-purchase questions, and single-contact
// coaching intentionally stay on Flash.
const PRO_TEXT_PATTERNS = [
  /\b(?:whole|entire)\s+(?:book|pipeline)\b/i,
  /\ball\s+(?:my\s+)?(?:leads|customers|contacts|deals)\b/i,
  /\b(?:plan|map|build)\s+(?:out\s+)?my\s+(?:week|weekly strategy)\b/i,
  /\bweekly\s+(?:coach|strategy|game plan|review)\b/i,
  /\b(?:compare|prioritize|rank)\b[\s\S]{0,48}\b(?:deals|customers|leads|pipeline|book)\b/i,
  /\b(?:conflicting|contradictory|doesn'?t match|context mix(?:ed|ing)?)\b/i,
];

export function chooseRexTier({
  workload = 'routine',
  text = '',
  hasConflictingContext = false,
  flashValidationFailed = false,
}: {
  workload?: RexWorkload;
  text?: string;
  hasConflictingContext?: boolean;
  flashValidationFailed?: boolean;
} = {}): BrainTier {
  if (flashValidationFailed || hasConflictingContext || PRO_WORKLOADS.has(workload)) return 'pro';
  return PRO_TEXT_PATTERNS.some((pattern) => pattern.test(text)) ? 'pro' : 'flash';
}

export function resolveMentionedContactId(
  text: string,
  contacts: { id: string; name: string }[],
): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ')} `;
  const fullMatches = contacts.filter((contact) => {
    const full = contact.name.trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ');
    return full.length > 1 && haystack.includes(` ${full} `);
  });
  if (fullMatches.length === 1) return fullMatches[0].id;
  if (fullMatches.length > 1) return null;

  const firstMatches = contacts.filter((contact) => {
    const first = contact.name.trim().toLowerCase().split(/\s+/)[0];
    return first.length > 1 && haystack.includes(` ${first} `);
  });
  return firstMatches.length === 1 ? firstMatches[0].id : null;
}
