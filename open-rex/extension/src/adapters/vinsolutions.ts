import type { ScrapedCustomer } from '../../../shared/types';

const GRID_CONFIGS = [
  { id: 'ctl00_ContentPlaceHolder1_NewLeadsList_RadGrid1', section: 'New Leads' },
  { id: 'ctl00_ContentPlaceHolder1_RepliesList_RadGrid1', section: 'Replies' },
  { id: 'ctl00_ContentPlaceHolder1_FollowUpsList_RadGrid1', section: 'Follow Ups' },
  { id: 'ctl00_ContentPlaceHolder1_OverdueList_RadGrid1', section: 'Overdue' },
  { id: 'ctl00_ContentPlaceHolder1_ServiceList_RadGrid1', section: 'Service Tasks' },
];

const DETAIL_FETCH_CONCURRENCY = 3;

interface RawScrapeResult {
  customer: ScrapedCustomer;
  link: HTMLAnchorElement | null;
}

function getLeftPaneDocument(): Document | null {
  const cardashboard = document.getElementById('cardashboardframe') as HTMLIFrameElement | null;
  if (!cardashboard) return null;
  const cardoc = cardashboard.contentDocument;
  if (!cardoc) return null;
  const leftPane = cardoc.getElementById('leftpaneframe') as HTMLIFrameElement | null;
  if (!leftPane) return null;
  return leftPane.contentDocument;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((s) => s.trim());
    return { firstName: first || '', lastName: last || '' };
  }
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Profile-page extractor. VinSolutions markup varies by tenant — these
// are broad heuristics. Expect to tune label regexes the first time a
// real profile comes back empty in a few spots.
interface RichProfile {
  phone: string | null;
  email: string | null;
  notes: string | null;
  interactionHistory: string | null;
  tradeInVehicle: string | null;
  purchasedVehicle: string | null;
  purchaseDate: string | null;
  lastContactDate: string | null;
}

function sectionAfterHeading(doc: Document, labelRegex: RegExp, maxChars = 2000): string | null {
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, label, th, strong'));
  for (const h of headings) {
    const text = (h.textContent ?? '').trim();
    if (labelRegex.test(text)) {
      const sibling = h.nextElementSibling ?? h.parentElement?.nextElementSibling;
      if (sibling) {
        const body = (sibling.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (body) return body.slice(0, maxChars);
      }
    }
  }
  return null;
}

function valueForLabel(doc: Document, labelRegex: RegExp): string | null {
  // VinSolutions often renders label/value as <td>Label</td><td>Value</td>
  // or <dt>Label</dt><dd>Value</dd>. Try both.
  const cells = Array.from(doc.querySelectorAll('td, dt, th'));
  for (const cell of cells) {
    const text = (cell.textContent ?? '').trim();
    if (labelRegex.test(text)) {
      const next = cell.nextElementSibling;
      if (next) {
        const value = (next.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (value && !labelRegex.test(value)) return value.slice(0, 240);
      }
    }
  }
  return null;
}

function extractActivityHistory(doc: Document): string | null {
  // Look for a table with headers that look like an activity log
  const tables = Array.from(doc.querySelectorAll('table'));
  for (const table of tables) {
    const headerText = (table.querySelector('thead, tr')?.textContent ?? '').toLowerCase();
    if (/date|type|activity|action|result/.test(headerText)) {
      const rows = Array.from(table.querySelectorAll('tbody tr, tr'));
      const lines: string[] = [];
      rows.forEach((r, i) => {
        if (i === 0) return; // header
        const cells = Array.from(r.querySelectorAll('td')).map((td) =>
          (td.textContent ?? '').replace(/\s+/g, ' ').trim(),
        );
        if (cells.some(Boolean)) lines.push(cells.filter(Boolean).slice(0, 4).join(' | '));
      });
      if (lines.length > 0) return lines.slice(0, 10).join('\n');
    }
  }
  return null;
}

function extractProfileFromHtml(html: string): RichProfile {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const mailto = doc.querySelector('a[href^="mailto:"]') as HTMLAnchorElement | null;
  let email = mailto ? mailto.href.replace(/^mailto:/i, '').split('?')[0] : null;
  if (!email) {
    const m = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    email = m ? m[0] : null;
  }

  let phone: string | null = null;
  const tel = doc.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null;
  if (tel) phone = normalizePhone(tel.href.replace(/^tel:/i, ''));
  if (!phone) {
    const labeled = html.match(/(?:cell|mobile|phone)[^0-9]{0,20}(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
    if (labeled) phone = normalizePhone(labeled[1]);
  }
  if (!phone) {
    const m = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    phone = m ? normalizePhone(m[0]) : null;
  }

  return {
    phone,
    email,
    notes: sectionAfterHeading(doc, /notes|comments|description/i, 2000),
    interactionHistory: extractActivityHistory(doc),
    tradeInVehicle: valueForLabel(doc, /^(trade|trade[- ]?in|current vehicle)\b/i),
    purchasedVehicle: valueForLabel(doc, /^(purchased|sold vehicle|primary vehicle)\b/i),
    purchaseDate: valueForLabel(doc, /^(purchase date|sold date|delivered)\b/i),
    lastContactDate: valueForLabel(doc, /^(last contact|last touched|last activity)\b/i),
  };
}

async function fetchDetail(link: HTMLAnchorElement): Promise<RichProfile> {
  const empty: RichProfile = {
    phone: null,
    email: null,
    notes: null,
    interactionHistory: null,
    tradeInVehicle: null,
    purchasedVehicle: null,
    purchaseDate: null,
    lastContactDate: null,
  };
  try {
    const res = await fetch(link.href, { credentials: 'include' });
    if (!res.ok) return empty;
    const html = await res.text();
    return extractProfileFromHtml(html);
  } catch {
    return empty;
  }
}

async function batchWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function scrapeGrid(leftDoc: Document, gridId: string, section: string): RawScrapeResult[] {
  const mainTable = leftDoc.getElementById(gridId + '_ctl00');
  if (!mainTable) return [];

  const rows = mainTable.querySelectorAll('tr.rgRow, tr.rgAltRow');
  const results: RawScrapeResult[] = [];

  rows.forEach((row, idx) => {
    const cells = row.querySelectorAll('td');

    const cell1 = cells[1];
    const nameLink = cell1?.querySelector('a.viewitemlink') as HTMLAnchorElement | null;
    const rawName = nameLink?.textContent?.trim() || 'Unknown';
    const { firstName, lastName } = splitName(rawName);

    let vehicle = '';
    if (cell1) {
      const vehicleFont = cell1.querySelector('font.Vehicle');
      vehicle = vehicleFont
        ? vehicleFont.textContent!.trim()
        : cell1.textContent!.trim().replace(rawName, '').trim();
    }

    const cell4 = cells[4];
    let status = '';
    let source = '';
    if (cell4) {
      const strongTag = cell4.querySelector('strong');
      if (strongTag) {
        status = strongTag.textContent!.trim();
        source = cell4.textContent!.trim().replace(status, '').trim();
      } else {
        const parts = cell4.textContent!.replace(/\s+/g, ' ').trim().split(/\n/);
        status = parts[0]?.trim() || '';
        source = parts[1]?.trim() || '';
      }
    }

    const updated = cells[5]?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const age = cells[6]?.textContent?.trim() || '';
    const cell7Text = cells[7]?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const cell8Text = cells[8]?.textContent?.replace(/\s+/g, ' ').trim() || '';

    const rawContext =
      [
        section ? `Section: ${section}` : '',
        age ? `Age: ${age} days` : '',
        updated ? `Updated: ${updated}` : '',
        cell7Text,
        cell8Text,
      ]
        .filter(Boolean)
        .join(' | ') || null;

    const externalId = nameLink?.href
      ? new URL(nameLink.href, location.href).searchParams.get('customerId') ||
        `${gridId}-${idx}-${rawName}`
      : `${gridId}-${idx}-${rawName}`;

    results.push({
      customer: {
        externalId,
        firstName,
        lastName,
        phone: null,
        email: null,
        vehicle: vehicle || null,
        lastContactedAt: updated || null,
        status: status || null,
        source: source || null,
        rawContext,
        notes: null,
        interactionHistory: null,
        tradeInVehicle: null,
        purchasedVehicle: null,
        purchaseDate: null,
        lastContactDate: null,
      },
      link: nameLink,
    });
  });

  return results;
}

export function matches(hostname: string): boolean {
  return hostname.includes('vinsolutions');
}

export async function prepare(): Promise<void> {
  const leftDoc = getLeftPaneDocument();
  if (!leftDoc) return;
  const allViewLink = leftDoc.querySelector('a[href*="View=All"]') as HTMLElement | null;
  allViewLink?.click();
  await new Promise((r) => setTimeout(r, 2000));
}

export async function extract(): Promise<ScrapedCustomer[]> {
  const leftDoc = getLeftPaneDocument();
  if (!leftDoc) return [];

  const raw: RawScrapeResult[] = [];
  for (const config of GRID_CONFIGS) {
    raw.push(...scrapeGrid(leftDoc, config.id, config.section));
  }

  // Dedupe by externalId before fetching details — same customer can appear
  // in multiple grid sections (e.g. Overdue + Follow Ups).
  const byId = new Map<string, RawScrapeResult>();
  for (const r of raw) {
    if (!byId.has(r.customer.externalId)) byId.set(r.customer.externalId, r);
  }
  const deduped = Array.from(byId.values());

  return batchWithLimit(deduped, DETAIL_FETCH_CONCURRENCY, async ({ customer, link }) => {
    if (!link) return customer;
    const profile = await fetchDetail(link);
    return {
      ...customer,
      phone: profile.phone,
      email: profile.email,
      notes: profile.notes,
      interactionHistory: profile.interactionHistory,
      tradeInVehicle: profile.tradeInVehicle,
      purchasedVehicle: profile.purchasedVehicle,
      purchaseDate: profile.purchaseDate,
      lastContactDate: profile.lastContactDate,
    };
  });
}
