import type { PlatformAdapter, AdapterHelpers, StructuredTask } from './types';
import type { ClickableContact } from '../../shared/types';

export const gmail: PlatformAdapter = {
  id: 'gmail',
  priority: 80,

  matches(hostname: string): boolean {
    return hostname.includes('mail.google');
  },

  extract(helpers: AdapterHelpers) {
    const tasks: StructuredTask[] = [];

    // Gmail thread rows use .zA class in the inbox list
    const rows = helpers.querySelectorAllDeep('.zA');
    for (const row of rows) {
      const el = row as HTMLElement;

      // Sender name: .yP or .zF elements hold the sender
      const senderEl = el.querySelector('.yP, .zF');
      const sender = senderEl?.getAttribute('name') || senderEl?.textContent?.trim() || '';
      if (!sender) continue;

      // Subject: .bog or .bqe span
      const subjectEl = el.querySelector('.bog, .bqe');
      const subject = subjectEl?.textContent?.trim() || '';

      // Snippet: .y2 span
      const snippetEl = el.querySelector('.y2');
      const snippet = snippetEl?.textContent?.trim() || '';

      // Date: .xW span
      const dateEl = el.querySelector('.xW span');
      const date = dateEl?.getAttribute('title') || dateEl?.textContent?.trim() || '';

      tasks.push({
        customerName: sender,
        vehicle: '',
        status: '',
        source: 'Gmail',
        age: date,
        taskDescription: subject,
        section: 'Inbox',
        template: '',
        rawContext: snippet,
      });
    }

    return {
      tasks,
      rawText: tasks.length > 0
        ? tasks.map((t, i) => `${i + 1}. ${t.customerName} | ${t.taskDescription} | ${t.rawContext}`).join('\n')
        : helpers.extractText(),
    };
  },

  findClickables(helpers: AdapterHelpers): ClickableContact[] {
    const rows = helpers.querySelectorAllDeep('.zA');
    const results: ClickableContact[] = [];
    const seen = new Set<string>();

    let index = 0;
    for (const row of rows) {
      const el = row as HTMLElement;
      const senderEl = el.querySelector('.yP, .zF');
      const name = senderEl?.getAttribute('name') || senderEl?.textContent?.trim() || '';
      if (!name || seen.has(name)) continue;
      seen.add(name);

      results.push({
        name,
        selector: helpers.buildUniqueSelector(el, index),
        href: '',
      });
      index++;
    }

    return results.slice(0, 30);
  },
};
