// Stalled Lead Intelligence — given the rep's book + a silent-days threshold,
// rank stalled contacts into KILL / PUSH / FENCE / WATCH buckets and ask the
// brain to draft re-engagement openers for the PUSH / FENCE rows.

import { supabase } from '@/lib/supabase';
import { REX_COPY_RULES } from './rexActions';
import { loadBookContext, type BookContact } from './bookContext';
import { callBrain } from './aiProxy';
import { frameUntrusted, clampNote } from './promptSafety';

export type StalledRecommendation = {
  contact_id: string;
  contact_name: string;
  days_silent: number;
  heat_score: number;
  last_contact_summary: string | null;
  vehicle: string | null;
  recommendation: 'KILL' | 'PUSH' | 'FENCE' | 'WATCH';
  reason: string;
  suggested_opener: string;
  suggested_language: 'en' | 'es';
};

export type StalledReport = {
  stalled_count: number;
  recommendations: StalledRecommendation[];
  summary: string;
};

function decide(c: BookContact): { rec: StalledRecommendation['recommendation']; reason: string } {
  if (c.days_silent > 21 && c.heat_score < 30) {
    return { rec: 'KILL', reason: 'Too old, too cold' };
  }
  if (c.days_silent > 14 && c.heat_score >= 60) {
    return { rec: 'PUSH', reason: 'Warm + time-sensitive' };
  }
  if (c.days_silent > 14 && c.heat_score >= 50 && c.heat_score < 60) {
    return { rec: 'FENCE', reason: 'Medium heat, test the interest' };
  }
  if (c.days_silent > 7 && c.heat_score < 40) {
    return { rec: 'KILL', reason: 'Cold going colder' };
  }
  return { rec: 'WATCH', reason: 'Normal cycle' };
}

function defaultOpener(c: BookContact): string {
  const first = c.name.split(' ')[0] ?? c.name;
  if (c.preferred_language === 'es') {
    return `hola ${first}, quería saber si todavía andas pensando en el ${c.vehicle ?? 'carro que vimos'}. avísame si te puedo ayudar con algo.`;
  }
  return `hey ${first}, wanted to circle back on the ${c.vehicle ?? 'one we talked about'}. let me know if I can help with anything.`;
}

function buildOpenerPrompt(contacts: BookContact[]): string {
  const rows = contacts.map(c => JSON.stringify({
    id: c.id,
    name: clampNote(c.name, 80),
    heat_score: c.heat_score,
    days_silent: c.days_silent,
    vehicle: c.vehicle,
    lease_end_date: c.lease_end_date,
    last_contact_summary: clampNote(c.last_contact_summary),
    preferred_language: c.preferred_language,
  })).join(',\n');

  return `You are Rex drafting one re-engagement opener per stalled contact below.

Each opener must:
1. Reference WHY now (lease window, time since last contact, season, inventory).
2. Stay under 280 characters.
3. Use Spanish (Mexican slang) if preferred_language is "es".
4. Obey every copy rule below.

${REX_COPY_RULES}

CONTACTS:
${frameUntrusted('CONTACT LIST', `[\n${rows}\n]`)}

Return ONLY a single JSON object inside a \`\`\`json fenced block:
{
  "openers": [
    { "contact_id": "...", "opener": "the draft text", "language": "en" | "es" }
  ]
}`;
}

type BrainOpener = { contact_id: string; opener: string; language: 'en' | 'es' };

async function fetchOpeners(contacts: BookContact[]): Promise<Map<string, BrainOpener>> {
  if (contacts.length === 0) return new Map();
  try {
    const raw = await callBrain({
      maxTokens: 1200,
      tier: 'flash',
      messages: [{ role: 'user', content: buildOpenerPrompt(contacts) }],
    });
    const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
    const obj = JSON.parse((fence ? fence[1] : raw).trim());
    const out = new Map<string, BrainOpener>();
    for (const o of obj.openers ?? []) {
      if (o?.contact_id && o?.opener) {
        out.set(String(o.contact_id), {
          contact_id: String(o.contact_id),
          opener: String(o.opener),
          language: o.language === 'es' ? 'es' : 'en',
        });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function analyzeStalledLeads({
  daysSilentThreshold = 14,
  includeDead = false,
}: {
  daysSilentThreshold?: number;
  includeDead?: boolean;
} = {}): Promise<StalledReport> {
  const book = await loadBookContext();
  const pool = [
    ...book.stalled,
    ...(includeDead ? book.dead : []),
  ].filter(c => !c.do_not_contact && c.days_silent >= daysSilentThreshold);

  const decided = pool.map(c => ({ contact: c, ...decide(c) }));

  const needOpeners = decided.filter(d => d.rec === 'PUSH' || d.rec === 'FENCE').map(d => d.contact);
  const openers = await fetchOpeners(needOpeners);

  const recommendations: StalledRecommendation[] = decided.map(d => {
    const opener = openers.get(d.contact.id);
    return {
      contact_id: d.contact.id,
      contact_name: d.contact.name,
      days_silent: d.contact.days_silent,
      heat_score: d.contact.heat_score,
      last_contact_summary: d.contact.last_contact_summary,
      vehicle: d.contact.vehicle,
      recommendation: d.rec,
      reason: d.reason,
      suggested_opener: opener?.opener ?? (d.rec === 'PUSH' || d.rec === 'FENCE' ? defaultOpener(d.contact) : ''),
      suggested_language: opener?.language ?? d.contact.preferred_language,
    };
  });

  // Sort: PUSH first, then FENCE, then KILL, then WATCH
  const priority: Record<StalledRecommendation['recommendation'], number> = {
    PUSH: 0, FENCE: 1, KILL: 2, WATCH: 3,
  };
  recommendations.sort((a, b) => priority[a.recommendation] - priority[b.recommendation] || b.days_silent - a.days_silent);

  const counts = recommendations.reduce((acc, r) => {
    acc[r.recommendation] = (acc[r.recommendation] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bits: string[] = [];
  if (counts.KILL) bits.push(`${counts.KILL} to kill`);
  if (counts.PUSH) bits.push(`${counts.PUSH} to push hard`);
  if (counts.FENCE) bits.push(`${counts.FENCE} to soft touch`);
  if (counts.WATCH) bits.push(`${counts.WATCH} on watch`);

  return {
    stalled_count: recommendations.length,
    recommendations,
    summary: recommendations.length === 0
      ? 'No stalled leads — book looks healthy.'
      : `${recommendations.length} stalled. ${bits.join(', ')}.`,
  };
}

// Bulk: set rep_decision='dead' (KILL means stop selling, start nurturing — not delete).
export async function batchKill(contactIds: string[]): Promise<void> {
  if (contactIds.length === 0) return;
  const { error } = await supabase
    .from('contacts')
    .update({ rep_decision: 'dead', updated_at: new Date().toISOString() })
    .in('id', contactIds);
  if (error) throw error;
}
