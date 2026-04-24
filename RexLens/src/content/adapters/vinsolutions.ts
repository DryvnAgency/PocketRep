import type { PlatformAdapter, AdapterHelpers, StructuredTask } from './types';
import type {
  ClickableContact,
  CustomerDetail,
  VehicleOfInterest,
  TradeIn,
  ContactEntry,
  ServiceRO,
} from '../../shared/types';

// ── VinSolutions (VinConnect) Adapter ───────────────────────────────────────
// Deep scraper for VinConnect's RadGrid worklist tables inside nested iframes.
// Iframe chain: top → #cardashboardframe → #leftpaneframe → RadGrid tables.

// Grid IDs for the four worklist sections
const GRID_CONFIGS = [
  { id: 'ctl00_ContentPlaceHolder1_NewLeadsList_RadGrid1', section: 'New Leads' },
  { id: 'ctl00_ContentPlaceHolder1_RepliesList_RadGrid1', section: 'Replies' },
  { id: 'ctl00_ContentPlaceHolder1_FollowUpsList_RadGrid1', section: 'Follow Ups' },
  { id: 'ctl00_ContentPlaceHolder1_OverdueList_RadGrid1', section: 'Overdue' },
  { id: 'ctl00_ContentPlaceHolder1_ServiceList_RadGrid1', section: 'Service Tasks' },
];

/** Navigate the VinConnect iframe chain to get the left pane document */
function getLeftPaneDocument(): Document | null {
  const cardashboard = document.getElementById('cardashboardframe') as HTMLIFrameElement | null;
  if (!cardashboard) return null;
  const cardoc = cardashboard.contentDocument;
  if (!cardoc) return null;
  const leftPane = cardoc.getElementById('leftpaneframe') as HTMLIFrameElement | null;
  if (!leftPane) return null;
  return leftPane.contentDocument;
}

/** Scrape structured tasks from a single RadGrid table */
function scrapeGrid(leftDoc: Document, gridId: string, section: string): StructuredTask[] {
  const mainTableId = gridId + '_ctl00';
  const mainTable = leftDoc.getElementById(mainTableId);
  if (!mainTable) return [];

  const dataRows = mainTable.querySelectorAll('tr.rgRow, tr.rgAltRow');
  const tasks: StructuredTask[] = [];

  for (const row of dataRows) {
    const cells = row.querySelectorAll('td');

    // Cell 1: customer name (a.viewitemlink) + vehicle (font.Vehicle or remaining text)
    const cell1 = cells[1];
    const nameLink = cell1?.querySelector('a.viewitemlink');
    const customerName = nameLink ? nameLink.textContent!.trim() : 'Unknown';

    let vehicle = '';
    if (cell1) {
      const vehicleFont = cell1.querySelector('font.Vehicle');
      if (vehicleFont) {
        vehicle = vehicleFont.textContent!.trim();
      } else {
        vehicle = cell1.textContent!.trim().replace(customerName, '').trim();
      }
    }

    // Cell 4: status (strong tag) + source (remaining text)
    const cell4 = cells[4];
    let status = '';
    let source = '';
    if (cell4) {
      const strongTag = cell4.querySelector('strong');
      if (strongTag) {
        status = strongTag.textContent!.trim();
        source = cell4.textContent!.trim().replace(status, '').trim();
      } else {
        const fullText = cell4.textContent!.replace(/\s+/g, ' ').trim();
        const parts = fullText.split(/\n/);
        status = parts[0]?.trim() || fullText;
        source = parts[1]?.trim() || '';
      }
    }

    // Cell 5: updated date
    const updated = cells[5]?.textContent?.replace(/\s+/g, ' ').trim() || '';

    // Cell 6: age in days
    const age = cells[6]?.textContent?.trim() || '';

    // Cell 9: task description (first span) + template (second span)
    const cell9 = cells[9];
    let taskDescription = '';
    let template = '';
    if (cell9) {
      const spans = cell9.querySelectorAll('span');
      if (spans.length > 0) taskDescription = spans[0].textContent!.trim();
      if (spans.length > 1) template = spans[1].textContent!.trim();
      if (!taskDescription) {
        taskDescription = cell9.textContent!
          .replace(/Dismiss|Edit|Assigned To:.*$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    // Cell 7: notes or additional info (if present)
    const cell7Text = cells[7]?.textContent?.replace(/\s+/g, ' ').trim() || '';
    // Cell 8: email preview or reply snippet (if present)
    const cell8Text = cells[8]?.textContent?.replace(/\s+/g, ' ').trim() || '';

    const contextParts: string[] = [];
    if (updated) contextParts.push(`Updated: ${updated}`);
    if (cell7Text) contextParts.push(cell7Text);
    if (cell8Text) contextParts.push(cell8Text);

    tasks.push({
      customerName,
      vehicle,
      status,
      source,
      age: age ? `${age} days` : '',
      taskDescription,
      section,
      template,
      rawContext: contextParts.join(' | ') || '',
    });
  }

  return tasks;
}

// ── Customer Detail Page Extraction ───────────────────────────────────────
// VinConnect customer detail pages render labeled fields like:
//   Status: Waiting for Prospect Response
//   Buyer/Co-Buyer: Eduardo Ponce
//   Created: 4/22/26 11:58p (2d)
//   Source: NISSANUSA - CONTACT DLR - PAYMENT EST (Internet)
//   Vehicle Info → 2026 Nissan Rogue Rock Creek AWD (New)
//   Trade-in Info → (none entered) OR a year/make/model line
// Plus a tab strip "Sales (3) | Wish List | Service (3) | Value" and a Contact History block.

/** Read text following a label like "Status:" by walking siblings/parent text */
function readLabeledField(doc: Document, label: string): string {
  // Find any node whose text starts with the label
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || '').trim();
    if (!text) continue;
    if (text.toLowerCase() === label.toLowerCase() || text.toLowerCase() === label.toLowerCase() + ':') {
      // Value is in the next sibling or parent's next text node
      const parent = node.parentElement;
      if (!parent) continue;
      // Try next sibling element
      let sib = parent.nextElementSibling as HTMLElement | null;
      if (sib && sib.textContent) {
        const v = sib.textContent.replace(/\s+/g, ' ').trim();
        if (v) return v;
      }
      // Try parent's next sibling
      sib = parent.parentElement?.nextElementSibling as HTMLElement | null;
      if (sib && sib.textContent) {
        const v = sib.textContent.replace(/\s+/g, ' ').trim();
        if (v) return v;
      }
    }
    // Inline form: "Label: value"
    const inline = new RegExp('^' + label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*:\\s*(.+)$', 'i');
    const match = text.match(inline);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** Parse a vehicle line like "2026 Nissan Rogue Rock Creek AWD (New)" or "2018 Nissan Murano" */
function parseVehicleLine(line: string): { year: string; make: string; model: string; trim?: string; condition?: 'New' | 'Used' | 'CPO' } | null {
  const cleaned = line.replace(/\s+/g, ' ').trim();
  const condMatch = cleaned.match(/\((New|Used|CPO|Certified)\)/i);
  const condition = condMatch
    ? (condMatch[1].toLowerCase().startsWith('cert') ? 'CPO' : (condMatch[1] as 'New' | 'Used' | 'CPO'))
    : undefined;
  const stripped = cleaned.replace(/\((New|Used|CPO|Certified)\)/i, '').trim();
  const parts = stripped.split(/\s+/);
  if (parts.length < 3) return null;
  const year = parts[0];
  if (!/^\d{4}$/.test(year)) return null;
  const make = parts[1];
  const model = parts[2];
  const trim = parts.slice(3).join(' ') || undefined;
  return { year, make, model, trim, condition };
}

function extractCustomerDetail(leftDoc: Document): CustomerDetail | null {
  const bodyText = (leftDoc.body?.textContent || '').replace(/\s+/g, ' ');
  // Heuristic: must look like a Lead Info / detail page
  if (!/Lead\s*Info/i.test(bodyText) && !/Vehicle\s*Info/i.test(bodyText)) return null;

  const status = readLabeledField(leftDoc, 'Status') || '';
  const created = readLabeledField(leftDoc, 'Created') || '';
  const sourceRaw = readLabeledField(leftDoc, 'Source') || '';
  const source = sourceRaw.replace(/\s*\((Internet|Phone|Walk-?in|Showroom)\)\s*$/i, '').trim();
  const salesRep = readLabeledField(leftDoc, 'Sales Rep') || undefined;
  const bdAgent = readLabeledField(leftDoc, 'BD Agent') || undefined;
  const manager = readLabeledField(leftDoc, 'Manager') || undefined;
  const contactedRaw = readLabeledField(leftDoc, 'Contacted');
  const contacted = /^yes/i.test(contactedRaw);
  const lastAttempt = readLabeledField(leftDoc, 'Attempted') || undefined;

  // Engagement Strength: look for "High|Medium|Low" near label text
  let engagement: CustomerDetail['engagement'] = '';
  const engRegex = /Engagement\s*Strength\s*[:\s]\s*(High|Medium|Low)/i;
  const engMatch = bodyText.match(engRegex);
  if (engMatch) engagement = engMatch[1] as CustomerDetail['engagement'];

  // Buyer name: look for "Buyer/Co-Buyer" header then read the customer name link/text
  let buyerName = '';
  const headers = leftDoc.querySelectorAll('h1,h2,h3,h4,h5,th,td,div,span,strong,b');
  for (const h of headers) {
    const t = (h.textContent || '').trim();
    if (/^Buyer\s*\/\s*Co-?Buyer$/i.test(t)) {
      let sib = h.nextElementSibling as HTMLElement | null;
      while (sib && !buyerName) {
        const v = (sib.textContent || '').replace(/\s+/g, ' ').trim();
        if (v && !/Buyer/i.test(v)) {
          buyerName = v.split(/\s{2,}|,/)[0].trim();
          break;
        }
        sib = sib.nextElementSibling as HTMLElement | null;
      }
      if (buyerName) break;
    }
  }
  // Fallback: page title or first .viewitemlink
  if (!buyerName) {
    const link = leftDoc.querySelector('a.viewitemlink, h1, h2');
    if (link) buyerName = (link.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Vehicle of Interest: scope DOM to the "Vehicle Info" header's container
  let voi: VehicleOfInterest | null = null;
  let trade: TradeIn | null = null;
  const allElements = leftDoc.querySelectorAll('*');
  for (const el of allElements) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text === 'Vehicle Info' || text === 'Vehicle Info ') {
      // Look at next sibling block for the vehicle line
      let sib = el.parentElement?.nextElementSibling as HTMLElement | null;
      let attempts = 0;
      while (sib && attempts < 5 && !voi) {
        const lines = (sib.textContent || '').split(/\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const parsed = parseVehicleLine(line);
          if (parsed) {
            const stockMatch = (sib.textContent || '').match(/Stock\s*#?\s*[:\-]?\s*([A-Z0-9-]+)/i);
            voi = { ...parsed, stock: stockMatch ? stockMatch[1] : undefined };
            break;
          }
        }
        sib = sib.nextElementSibling as HTMLElement | null;
        attempts++;
      }
    }
    if (text === 'Trade-in Info' || text === 'Trade In Info' || text === 'Trade-In Info') {
      let sib = el.parentElement?.nextElementSibling as HTMLElement | null;
      let attempts = 0;
      while (sib && attempts < 5 && !trade) {
        const blob = (sib.textContent || '').replace(/\s+/g, ' ').trim();
        if (/none entered/i.test(blob)) break;
        const lines = blob.split(/\s{2,}|,/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const parsed = parseVehicleLine(line);
          if (parsed) {
            const vinMatch = blob.match(/\bVIN\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/i);
            const milesMatch = blob.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:mi|miles)\b/i);
            trade = {
              year: parsed.year,
              make: parsed.make,
              model: parsed.model,
              vin: vinMatch ? vinMatch[1] : undefined,
              mileage: milesMatch ? milesMatch[1] : undefined,
            };
            break;
          }
        }
        sib = sib.nextElementSibling as HTMLElement | null;
        attempts++;
      }
    }
  }

  const contactHistory = extractContactHistory(leftDoc);
  const serviceHistory = extractServiceHistory(leftDoc);

  return {
    status,
    buyerName,
    created,
    source,
    salesRep,
    bdAgent,
    manager,
    contacted,
    lastAttempt,
    engagement,
    voi,
    trade,
    contactHistory,
    serviceHistory,
  };
}

function extractContactHistory(leftDoc: Document): ContactEntry[] {
  const entries: ContactEntry[] = [];
  // Look for a Contact History header, then walk subsequent rows
  const headers = leftDoc.querySelectorAll('h1,h2,h3,h4,h5,th,strong,b,div,span');
  let historyRoot: Element | null = null;
  for (const h of headers) {
    if (/^Contact\s*History$/i.test((h.textContent || '').trim())) {
      historyRoot = h.closest('table') || h.parentElement?.parentElement || h.parentElement;
      break;
    }
  }
  if (!historyRoot) return entries;

  const rows = historyRoot.querySelectorAll('tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;
    const cellTexts = Array.from(cells).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim());
    const joined = cellTexts.join(' ');
    if (!joined || /Contact\s*History/i.test(joined)) continue;

    let type: ContactEntry['type'] = 'other';
    if (/\bemail\b/i.test(joined)) type = 'email';
    else if (/\bcall\b|\bphone\b/i.test(joined)) type = 'call';
    else if (/\btext\b|\bsms\b/i.test(joined)) type = 'text';
    else if (/\bletter\b/i.test(joined)) type = 'letter';
    else if (/\bnote\b/i.test(joined)) type = 'note';
    else if (/\bvisit\b|\bshowroom\b/i.test(joined)) type = 'visit';

    const dateMatch = joined.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}(\s+\d{1,2}:\d{2}\s*[ap]?m?)?/i);
    const date = dateMatch ? dateMatch[0] : '';
    const subject = cellTexts.find(c => c.length > 5 && c.length < 100 && !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c));
    const snippetCell = cellTexts.find(c => c.length > 30);
    const replied = /\breplied\b|\banswered\b/i.test(joined);
    const direction: 'in' | 'out' | undefined = /\binbound\b|\bfrom\s+customer\b/i.test(joined)
      ? 'in'
      : /\boutbound\b|\bsent\b/i.test(joined)
        ? 'out'
        : undefined;

    entries.push({ type, date, subject, snippet: snippetCell, direction, replied });
  }
  return entries.slice(0, 30);
}

function extractServiceHistory(leftDoc: Document): ServiceRO[] {
  const entries: ServiceRO[] = [];
  // Find tables that look like the service RO list (RO# | Vehicle | Date/Time)
  const tables = leftDoc.querySelectorAll('table');
  for (const table of tables) {
    const headerRow = table.querySelector('tr');
    if (!headerRow) continue;
    const headerText = (headerRow.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/RO\s*#/i.test(headerText) || !/Date.*Time/i.test(headerText)) continue;

    const rows = table.querySelectorAll('tr');
    rows.forEach((row, idx) => {
      if (idx === 0) return; // skip header
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) return;
      const ro = (cells[0].textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^\d{4,}/.test(ro)) return;
      const vehicle = (cells[1].textContent || '').replace(/\s+/g, ' ').trim();
      const dateTime = (cells[2].textContent || '').replace(/\s+/g, ' ').trim();
      entries.push({ ro, vehicle, dateTime });
    });
  }

  // Pull RO detail block (Vin, Mileage, totals, advisor) for the most recent RO
  if (entries.length > 0) {
    const bodyText = (leftDoc.body?.textContent || '').replace(/\s+/g, ' ');
    const vinMatch = bodyText.match(/\bVin\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/i);
    const milesMatch = bodyText.match(/Mileage\s*[:\-]?\s*([\d,]+)/i);
    const advisorMatch = bodyText.match(/Advisor\s*[:\-]?\s*([A-Za-z][A-Za-z\s\-\.()]{1,40})/);
    const totalMatch = bodyText.match(/RO\s*Total\s*[:\-]?\s*\$?([\d,.]+)/i);
    const last = entries[0];
    if (vinMatch) last.vin = vinMatch[1];
    if (milesMatch) last.mileage = milesMatch[1];
    if (advisorMatch) last.advisor = advisorMatch[1].trim();
    if (totalMatch) last.total = '$' + totalMatch[1];
  }

  return entries.slice(0, 20);
}

/** Click the Service tab in the "Sales | Wish List | Service | Value" tab strip */
async function clickServiceTab(_helpers: AdapterHelpers): Promise<boolean> {
  const leftDoc = getLeftPaneDocument();
  if (!leftDoc) return false;

  // Strategy 1: anchor with text exactly "Service" or "Service (n)"
  const links = leftDoc.querySelectorAll('a, button, [role="tab"]');
  for (const link of links) {
    const t = (link.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^Service(\s*\(\d+\))?$/i.test(t)) {
      // Confirm we're in a tab strip context (sibling tabs include Sales/Wish List/Value)
      const parent = link.parentElement;
      const siblingText = parent ? (parent.textContent || '') : '';
      if (/Sales/i.test(siblingText) || /Wish\s*List/i.test(siblingText) || /Value/i.test(siblingText)) {
        try {
          (link as HTMLElement).click();
          await new Promise(r => setTimeout(r, 2000));
          return true;
        } catch {
          return false;
        }
      }
    }
  }
  return false;
}

/** Detect whether the current page is a customer detail page (vs worklist) */
function isCustomerDetailPage(leftDoc: Document): boolean {
  const text = (leftDoc.body?.textContent || '').replace(/\s+/g, ' ');
  return /Lead\s*Info/i.test(text) && /Vehicle\s*Info/i.test(text);
}

export const vinsolutions: PlatformAdapter = {
  id: 'vinsolutions',
  priority: 100,

  matches(hostname: string): boolean {
    return hostname.includes('vinsolutions');
  },

  /** Click the "All" view link so every grid section loads */
  async prepare(helpers: AdapterHelpers): Promise<void> {
    const leftDoc = getLeftPaneDocument();
    if (!leftDoc) return;

    const allViewLink = leftDoc.querySelector('a[href*="View=All"]') as HTMLElement | null;
    if (allViewLink) {
      helpers.cspSafeClick(allViewLink);
      // Wait for grids to load after clicking All view
      await new Promise(r => setTimeout(r, 2000));
    }
  },

  extract(helpers: AdapterHelpers) {
    const leftDoc = getLeftPaneDocument();

    if (!leftDoc) {
      // Iframe chain not accessible — fall back to generic text extraction
      return { tasks: [], rawText: helpers.extractText() };
    }

    // Detail page path: extract structured customer data instead of worklist tasks
    if (isCustomerDetailPage(leftDoc)) {
      const detail = extractCustomerDetail(leftDoc);
      const rawText = (leftDoc.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
      return {
        tasks: [],
        rawText,
        customerDetail: detail || undefined,
      };
    }

    const tasks: StructuredTask[] = [];
    for (const config of GRID_CONFIGS) {
      tasks.push(...scrapeGrid(leftDoc, config.id, config.section));
    }

    // Build rawText as fallback (combine all task data into readable text)
    const rawText = tasks.length > 0
      ? tasks.map((t, i) =>
          `${i + 1}. ${t.customerName} | ${t.vehicle} | ${t.status} | ${t.source} | Age: ${t.age} | Task: ${t.taskDescription} | Section: ${t.section}`
        ).join('\n')
      : helpers.extractText();

    return { tasks, rawText };
  },

  clickServiceTab,

  findClickables(helpers: AdapterHelpers): ClickableContact[] {
    const leftDoc = getLeftPaneDocument();
    if (!leftDoc) return [];

    // Find all a.viewitemlink elements — these are the actual clickable lead names
    const links = leftDoc.querySelectorAll<HTMLAnchorElement>('a.viewitemlink');
    const results: ClickableContact[] = [];
    const seen = new Set<string>();

    let index = 0;
    for (const link of links) {
      const name = link.textContent?.trim() || '';
      if (!name || name.length < 2 || seen.has(name)) continue;
      seen.add(name);

      results.push({
        name,
        selector: helpers.buildUniqueSelector(link, index),
        href: link.href || '',
      });
      index++;
    }

    return results.slice(0, 30);
  },
};
