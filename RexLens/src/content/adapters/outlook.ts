import type { PlatformAdapter, AdapterHelpers, StructuredTask } from './types';
import type { ClickableContact } from '../../shared/types';

export const outlook: PlatformAdapter = {
  id: 'outlook',
  priority: 80,

  matches(hostname: string): boolean {
    return hostname.includes('outlook.live')
      || hostname.includes('outlook.office');
  },

  extract(helpers: AdapterHelpers) {
    const tasks: StructuredTask[] = [];

    // Outlook message list items use [role="option"] or [role="listitem"]
    const items = helpers.querySelectorAllDeep('[role="option"], [role="listitem"]');
    for (const item of items) {
      const el = item as HTMLElement;
      const text = el.textContent?.trim() || '';
      if (text.length < 5 || text.length > 500) continue;

      // Try to extract sender and subject from nested elements
      // Outlook DOM varies but typically has sender in a span and subject in another
      const spans = el.querySelectorAll('span');
      let sender = '';
      let subject = '';
      let preview = '';

      for (const span of spans) {
        const t = span.textContent?.trim() || '';
        if (!t || t.length > 200) continue;
        // First substantial span is usually the sender, second is subject
        if (!sender && t.length > 1 && t.length < 60) { sender = t; continue; }
        if (!subject && t.length > 1) { subject = t; continue; }
        if (!preview && t.length > 5) { preview = t; break; }
      }

      if (!sender) continue;

      tasks.push({
        customerName: sender,
        vehicle: '',
        status: '',
        source: 'Outlook',
        age: '',
        taskDescription: subject,
        section: 'Inbox',
        template: '',
        rawContext: preview,
      });
    }

    return {
      tasks,
      rawText: tasks.length > 0
        ? tasks.map((t, i) => `${i + 1}. ${t.customerName} | ${t.taskDescription}`).join('\n')
        : helpers.extractText(),
    };
  },

  findClickables(helpers: AdapterHelpers): ClickableContact[] {
    const items = helpers.querySelectorAllDeep('[role="option"], [role="listitem"]');
    const results: ClickableContact[] = [];
    const seen = new Set<string>();

    let index = 0;
    for (const item of items) {
      const el = item as HTMLElement;
      const spans = el.querySelectorAll('span');
      let sender = '';
      for (const span of spans) {
        const t = span.textContent?.trim() || '';
        if (t.length > 1 && t.length < 60) { sender = t; break; }
      }
      if (!sender || seen.has(sender)) continue;
      seen.add(sender);

      results.push({
        name: sender,
        selector: helpers.buildUniqueSelector(el, index),
        href: '',
      });
      index++;
    }

    return results.slice(0, 30);
  },
};
