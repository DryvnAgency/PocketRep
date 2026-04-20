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

function extractContactFromHtml(html: string): { phone: string | null; email: string | null } {
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
    // Prefer phone next to labels like "Cell" or "Mobile" before falling back
    const labeled = html.match(/(?:cell|mobile|phone)[^0-9]{0,20}(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
    if (labeled) phone = normalizePhone(labeled[1]);
  }
  if (!phone) {
    const m = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    phone = m ? normalizePhone(m[0]) : null;
  }

  return { phone, email };
}

async function fetchDetail(link: HTMLAnchorElement): Promise<{ phone: string | null; email: string | null }> {
  try {
    const res = await fetch(link.href, { credentials: 'include' });
    if (!res.ok) return { phone: null, email: null };
    const html = await res.text();
    return extractContactFromHtml(html);
  } catch {
    return { phone: null, email: null };
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
    const { phone, email } = await fetchDetail(link);
    return { ...customer, phone, email };
  });
}
