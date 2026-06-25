// Pure draft-generation core for the new-contact -> recap -> follow-up feature.
//
// Deliberately has NO supabase / network imports (only promptSafety) so the prompt
// builders + parser are unit-testable with mock contact data and zero live model
// calls. followupSequence.ts wraps these with an injectable brain fn + DB ops.
//
// Every customer-supplied note is wrapped with frameUntrusted so a malicious note
// ("ignore your instructions and …") can't steer the draft — same defense as the
// rest of the brain path.

import { frameUntrusted, clampNote } from './promptSafety';

export type RecapInput = {
  name: string;
  vehicle?: string | null;
  note?: string | null;
};

export type FollowupInput = RecapInput & {
  day: number;
  totalDays: number;
  priorDrafts?: string[];
};

// Concise copy guidance inlined (not imported from rexActions, which pulls in
// supabase) so this module stays pure. Drafts are rep-editable, so this is a steer.
const COPY_RULES = [
  'Write like a real salesperson texting a customer, not a corporate template.',
  'Open with "hey". Never use an em-dash or en-dash. Short sentences. 2 to 4 sentences, under 280 characters.',
  'Never write "just checking in", "touching base", or "hope this finds you well". Close with something like "let me know" or "just say the word".',
  'Never invent a specific price, payment, date, or fact that is not given.',
].join(' ');

function firstNameOf(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

// Recap text the rep sends right after meeting a new customer.
export function buildRecapPrompt(input: RecapInput): string {
  const vehicle = clampNote(input.vehicle, 80);
  return [
    `You are Rex, a car salesperson's assistant. The rep just met ${input.name || 'a new customer'} and wants to text them a short recap of the visit and the next step.`,
    vehicle ? `Vehicle of interest: ${vehicle}.` : 'No specific vehicle was noted.',
    'Base the recap on the rep\'s note about what the customer wants:',
    frameUntrusted('CUSTOMER NOTE', clampNote(input.note, 600) || '(no note)'),
    COPY_RULES,
    `Write ONE text message to ${firstNameOf(input.name)} recapping the visit and what happens next. Return ONLY the message text, no preamble, no quotes.`,
  ].join('\n\n');
}

// Day-N message in the running 14-day follow-up.
export function buildFollowupPrompt(input: FollowupInput): string {
  const vehicle = clampNote(input.vehicle, 80);
  const prior = (input.priorDrafts ?? [])
    .slice(-3)
    .map(d => `- ${clampNote(d, 200)}`)
    .join('\n');
  return [
    `You are Rex drafting day ${input.day} of a ${input.totalDays}-day follow-up with ${input.name || 'a customer'} who has not replied yet.`,
    vehicle ? `Vehicle of interest: ${vehicle}.` : '',
    'What the customer wants:',
    frameUntrusted('CUSTOMER NOTE', clampNote(input.note, 600) || '(no note)'),
    prior ? `Messages already sent (do NOT repeat these — change the angle):\n${prior}` : '',
    COPY_RULES,
    `Write ONE fresh, low-pressure follow-up text to ${firstNameOf(input.name)} for day ${input.day}. Return ONLY the message text, no preamble, no quotes.`,
  ].filter(Boolean).join('\n\n');
}

// Pull the message out of a brain reply: prefer a fenced block if present, else the
// whole reply; strip a single pair of wrapping quotes the model sometimes adds.
export function parseDraft(raw: string): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  const fence = text.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/);
  let out = (fence ? fence[1] : text).trim();
  out = out.replace(/^["'“‘]/, '').replace(/["'”’]$/, '').trim();
  return out;
}

export function dayLabel(currentDay: number, totalDays: number): string {
  return `Day ${Math.min(Math.max(1, currentDay), totalDays)} of ${totalDays}`;
}
