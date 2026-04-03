import type { Contact, PageContent } from './types';

export const REX_MODEL = 'claude-haiku-4-5-20251001';
export const AI_PROXY_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy/anthropic';

export function buildScreenAnalysisPrompt(
  repName: string,
  page: PageContent,
  matchedContacts: Contact[],
): string {
  const contactContext = matchedContacts.length > 0
    ? matchedContacts.map(c =>
      `- ${c.first_name} ${c.last_name} | Heat: ${c.heat_tier ?? 'unscored'} | ` +
      `Vehicle: ${[c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ') || 'N/A'} | ` +
      `Stage: ${c.stage ?? 'unknown'} | Notes: ${c.notes ?? 'none'} | ` +
      `Last contact: ${c.last_contact_date ?? 'never'}`
    ).join('\n')
    : 'No known contacts matched on this page.';

  return `You are Rex Lens — a sharp, no-BS AI sales intelligence overlay built into PocketRep. You're reading what ${repName || 'the rep'} sees on their screen right now.

Page type: ${page.type}
Page title: ${page.title}
URL: ${page.url}

Page content:
${page.mainText.slice(0, 4000)}

${page.conversations.length > 0 ? `Conversations on page:\n${page.conversations.join('\n---\n')}` : ''}

Known PocketRep contacts that may match:
${contactContext}

Analyze this screen and respond in this exact JSON format (no markdown, no code fences):
{
  "situation": "One sentence: what's happening on this screen",
  "suggestions": ["2-3 specific next actions to move this deal forward"],
  "draftResponse": "If there's a conversation or email, draft the best reply using actual words to say. Null if not applicable.",
  "followUp": "Recommended follow-up timing and method. Null if not applicable."
}

Rules:
- Short, punchy language. No corporate filler.
- Give actual words to say/type, not strategy lectures.
- If you see an objection, give a specific rebuttal.
- If you see contact info, flag whether they're in PocketRep or should be added.
- Never say "I cannot" — find an angle or suggest a creative approach.`;
}

export function buildChatPrompt(
  repName: string,
  pageContext: string,
  suggestionsContext: string,
): string {
  return `You are Rex Lens — a sharp, no-BS AI sales assistant built into PocketRep. You're helping ${repName || 'the rep'} right now as they work in their browser.

Current page context:
${pageContext}

Your previous suggestions:
${suggestionsContext}

Rules:
- Short, punchy responses. No corporate filler.
- Give actual words to say, not strategy lectures.
- If asked for alternatives, give different angles.
- Never say "I cannot" — find an approach.`;
}

// Sensitive data patterns to strip before sending to AI
const SENSITIVE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,           // SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
  /\bpassword\s*[:=]\s*\S+/gi,         // Password fields
  /\bssn\s*[:=]\s*\S+/gi,              // SSN fields
  /\bcvv\s*[:=]\s*\d+/gi,              // CVV
];

export function stripSensitiveData(text: string): string {
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}
