import type { BookContact, BookContext } from './bookContext';

export type CallNextResult = {
  contact: BookContact;
  reason: string;
  suggested_opener: string;
};

const OPENERS = {
  en: 'hey {firstName}, want to grab 2 minutes today to talk through what we discussed? let me know if I can help with anything.',
  es: 'hola {firstName}, ¿tienes dos minutos hoy para platicar de lo que hablamos? avísame si te puedo ayudar con algo.',
};

function firstName(c: BookContact): string {
  return c.name.split(' ')[0] ?? c.name;
}

function defaultOpener(c: BookContact): string {
  const t = OPENERS[c.preferred_language] ?? OPENERS.en;
  return t.replace('{firstName}', firstName(c));
}

// Pick the single best contact to call right now from a chosen tier.
// Priority: highest heat_score, then longest silent within the same tier.
export function chooseNextCall(ctx: BookContext, tier: 'hot' | 'warm' | 'watch' | 'any' = 'hot'): CallNextResult | null {
  const pool =
    tier === 'hot' ? ctx.hot :
    tier === 'warm' ? ctx.warm :
    tier === 'watch' ? ctx.watch :
    [...ctx.hot, ...ctx.warm, ...ctx.watch];

  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => b.heat_score - a.heat_score || b.days_silent - a.days_silent);
  const top = sorted[0];

  const reasons: string[] = [];
  reasons.push(`heat ${top.heat_score}`);
  if (top.days_silent > 0) reasons.push(`${top.days_silent}d silent`);
  if (top.lease_end_date) reasons.push(`lease ${top.lease_end_date}`);
  if (top.last_contact_summary) reasons.push(top.last_contact_summary.slice(0, 80));

  return {
    contact: top,
    reason: reasons.join(' · '),
    suggested_opener: defaultOpener(top),
  };
}
