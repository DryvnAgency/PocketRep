import type { ScrapedCustomer } from '../../../shared/types';

const GRID_CONFIGS = [
  { id: 'ctl00_ContentPlaceHolder1_NewLeadsList_RadGrid1', section: 'New Leads' },
  { id: 'ctl00_ContentPlaceHolder1_RepliesList_RadGrid1', section: 'Replies' },
  { id: 'ctl00_ContentPlaceHolder1_FollowUpsList_RadGrid1', section: 'Follow Ups' },
  { id: 'ctl00_ContentPlaceHolder1_OverdueList_RadGrid1', section: 'Overdue' },
  { id: 'ctl00_ContentPlaceHolder1_ServiceList_RadGrid1', section: 'Service Tasks' },
];

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

function scrapeGrid(leftDoc: Document, gridId: string, section: string): ScrapedCustomer[] {
  const mainTable = leftDoc.getElementById(gridId + '_ctl00');
  if (!mainTable) return [];

  const rows = mainTable.querySelectorAll('tr.rgRow, tr.rgAltRow');
  const customers: ScrapedCustomer[] = [];

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

    const rawContext = [
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

    customers.push({
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
    });
  });

  return customers;
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

// TODO: phone + email are not on VinSolutions list rows — only on the
// customer detail page. For SMS to actually send, extend extract() to
// click each a.viewitemlink, wait for detail panel, scrape phone/email,
// then close. Throttle to avoid rate limits.
export function extract(): ScrapedCustomer[] {
  const leftDoc = getLeftPaneDocument();
  if (!leftDoc) return [];
  const all: ScrapedCustomer[] = [];
  for (const config of GRID_CONFIGS) {
    all.push(...scrapeGrid(leftDoc, config.id, config.section));
  }
  return all;
}
