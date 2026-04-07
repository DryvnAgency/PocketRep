import type { PlatformAdapter, AdapterHelpers } from './types';

export const generic: PlatformAdapter = {
  id: 'generic',
  priority: 0,

  matches(): boolean {
    return true; // always matches as fallback
  },

  extract(helpers: AdapterHelpers) {
    return {
      tasks: [],
      rawText: helpers.extractText(),
    };
  },
};
