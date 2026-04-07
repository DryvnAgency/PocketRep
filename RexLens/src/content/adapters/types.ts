import type { ClickableContact, StructuredTask } from '../../shared/types';

export type { StructuredTask };

// ── Adapter Helpers ────────────────────────────────────────────────────────
// Functions the content script exposes for adapters to use.

export interface AdapterHelpers {
  querySelectorAllDeep: (selector: string) => Element[];
  extractText: (root?: Element | Document) => string;
  cspSafeClick: (el: HTMLElement) => void;
  buildUniqueSelector: (el: HTMLElement, index: number) => string;
}

// ── Platform Adapter ───────────────────────────────────────────────────────

export interface PlatformAdapter {
  id: string;
  priority: number;         // higher = checked first; generic = 0
  matches(hostname: string): boolean;
  extract(helpers: AdapterHelpers): { tasks: StructuredTask[]; rawText: string };
  findClickables?(helpers: AdapterHelpers): ClickableContact[];
  prepare?(helpers: AdapterHelpers): Promise<void>;
}
