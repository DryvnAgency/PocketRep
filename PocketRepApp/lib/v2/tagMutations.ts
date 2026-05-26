import { supabase } from '@/lib/supabase';
import { updateContactTags } from './updateContact';
import type { V2Contact } from './useContacts';

export async function createTag(name: string, color: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { error } = await supabase
    .from('tags')
    .insert({ user_id: user.id, name: name.trim(), color })
    .select()
    .single();
  if (error && !/duplicate/i.test(error.message)) throw error;
}

export async function applyTagToContacts(
  contacts: V2Contact[],
  tagName: string,
  contactIds: string[],
): Promise<V2Contact[]> {
  const targets = new Set(contactIds);
  const updates: Promise<void>[] = [];
  const next: V2Contact[] = [];
  for (const c of contacts) {
    const hasTag = c.tags.includes(tagName);
    const shouldHave = targets.has(c.id);
    if (shouldHave && !hasTag) {
      const newTags = [...c.tags, tagName];
      updates.push(updateContactTags(c.id, newTags));
      next.push({ ...c, tags: newTags });
    } else if (!shouldHave && hasTag) {
      const newTags = c.tags.filter(t => t !== tagName);
      updates.push(updateContactTags(c.id, newTags));
      next.push({ ...c, tags: newTags });
    } else {
      next.push(c);
    }
  }
  await Promise.all(updates);
  return next;
}
