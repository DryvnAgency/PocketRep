import type { PlatformAdapter, AdapterHelpers, StructuredTask } from './types';
import type { ClickableContact } from '../../shared/types';

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
