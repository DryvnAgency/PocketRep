import type { PlatformAdapter } from './types';
import { vinsolutions } from './vinsolutions';
import { gmail } from './gmail';
import { outlook } from './outlook';
import { generic } from './generic';

const adapters: PlatformAdapter[] = [
  vinsolutions,
  gmail,
  outlook,
  generic,
].sort((a, b) => b.priority - a.priority);

export function getAdapter(hostname: string): PlatformAdapter {
  return adapters.find(a => a.matches(hostname))!;
}
