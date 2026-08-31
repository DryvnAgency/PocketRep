export const SEQUENCE_TEMPLATE_TOKENS = [
  'first_name',
  'last_name',
  'rep_name',
  'dealer',
  'dealership',
  'vehicle',
  'product',
  'vehicle_make',
  'color',
  'trade',
  'trade_in',
  'lease_end',
  'lease',
] as const;

export type SequenceTemplateToken = typeof SEQUENCE_TEMPLATE_TOKENS[number];

export type SequenceTemplateContext = {
  firstName?: string | null;
  lastName?: string | null;
  repName?: string | null;
  dealer?: string | null;
  vehicle?: string | null;
  vehicleMake?: string | null;
  color?: string | null;
  trade?: string | null;
  leaseEnd?: string | null;
};

export type RenderedSequenceTemplate = {
  message: string;
  unresolvedTokens: string[];
};

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const SUPPORTED_TOKENS = new Set<string>(SEQUENCE_TEMPLATE_TOKENS);

function clean(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export function getSequenceTemplateTokens(template: string | null | undefined): string[] {
  const tokens = new Set<string>();
  String(template ?? '').replace(TOKEN_PATTERN, (_match, token: string) => {
    tokens.add(token);
    return _match;
  });
  return [...tokens];
}

export function getUnsupportedSequenceTemplateTokens(template: string | null | undefined): string[] {
  return getSequenceTemplateTokens(template).filter(token => !SUPPORTED_TOKENS.has(token));
}

export function inferSequenceColor(trim: string | null | undefined): string | null {
  const normalized = clean(trim);
  if (!normalized || !/[·/|]/.test(normalized)) return null;
  return clean(normalized.split(/[·/|]/, 1)[0]);
}

export function renderSequenceTemplate(
  template: string | null | undefined,
  context: SequenceTemplateContext,
): RenderedSequenceTemplate {
  const firstName = clean(context.firstName) ?? 'there';
  const vehicle = clean(context.vehicle) ?? 'your vehicle';
  const replacements: Record<SequenceTemplateToken, string | null> = {
    first_name: firstName,
    last_name: clean(context.lastName) ?? '',
    rep_name: clean(context.repName),
    dealer: clean(context.dealer),
    dealership: clean(context.dealer),
    vehicle,
    product: vehicle,
    vehicle_make: clean(context.vehicleMake) ?? vehicle,
    color: clean(context.color),
    trade: clean(context.trade),
    trade_in: clean(context.trade),
    lease_end: clean(context.leaseEnd),
    lease: clean(context.leaseEnd),
  };
  const unresolved = new Set<string>();

  const message = String(template ?? '').replace(TOKEN_PATTERN, (match, token: string) => {
    if (!SUPPORTED_TOKENS.has(token)) {
      unresolved.add(token);
      return match;
    }
    const replacement = replacements[token as SequenceTemplateToken];
    if (replacement === null) {
      unresolved.add(token);
      return match;
    }
    return replacement;
  });

  return { message, unresolvedTokens: [...unresolved] };
}

export function formatSequenceTemplateTokens(tokens: string[]): string {
  return tokens.map(token => token.replace(/_/g, ' ')).join(', ');
}
