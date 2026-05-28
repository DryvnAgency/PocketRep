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

// Deletes a tag from the user's tag library AND strips it from every contact
// that still carries it (the contacts.tags array is denormalized), so no
// orphaned chips linger after deletion.
export async function deleteTag(name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('user_id', user.id)
    .eq('name', name);
  if (error) throw error;

  // Strip the tag from any contact that has it.
  const { data: rows } = await supabase
    .from('contacts')
    .select('id,tags')
    .eq('user_id', user.id)
    .contains('tags', [name]);
  await Promise.all(
    (rows ?? []).map(r =>
      updateContactTags(r.id, ((r.tags as string[]) ?? []).filter(t => t !== name)),
    ),
  );
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
