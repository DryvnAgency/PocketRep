// ─── PocketRep Services ───────────────────────────────────────────────────────
// Ported from Snack v8 FINAL — all data services for the multi-file app

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  SUPABASE_URL,
  LOCAL_CONTACT_META_KEY,
  LOCAL_SEQUENCE_STORAGE_KEY,
  LOCAL_ARCHIVED_SEQ_IDS_KEY,
  SEQUENCE_ASSIGNMENT_KEY,
  MASS_TEXT_HISTORY_KEY,
  DEFAULT_SEQUENCE_TEMPLATES,
  buildLocalSequence,
  mergeSequencesById,
} from '@/lib/constants';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

// ─── AUTH SERVICE ─────────────────────────────────────────────────────────────
export const authService = {
  signIn: async ({ identifier, password }: { identifier: string; password: string }) => {
    const usernameInput = identifier.trim().toLowerCase();
    if (usernameInput.includes('@')) throw new Error('Login with your Username only.');

    const { data: profile, error: lookupError } = await supabase
      .from('users')
      .select('email')
      .eq('username', usernameInput)
      .maybeSingle();

    if (lookupError) throw new Error('Connection error. Try again.');
    if (!profile?.email) throw new Error(`Username "${usernameInput}" not found. Check your spelling.`);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (authError) throw new Error('Invalid password. Please try again.');
    return data;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  getUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    const meta = (user as any)?.raw_user_meta_data || {};
    return {
      ...(profile || {}),
      id: profile?.id || user.id,
      email: profile?.email || user.email,
      username: profile?.username || meta.username || (user.email ? user.email.split('@')[0] : 'rep'),
      full_name: profile?.full_name || meta.full_name || meta.name || '',
      phone: profile?.phone || meta.phone || '',
      industry: profile?.industry || meta.industry || 'auto',
      plan: profile?.plan || meta.plan || 'solo',
      subscription_active: typeof profile?.subscription_active === 'boolean' ? profile.subscription_active : false,
      rep_name_for_ai: profile?.rep_name_for_ai || meta.rep_name_for_ai || '',
      company_name: profile?.company_name || meta.company_name || '',
    };
  },

  updateProfile: async (updates: any = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated.');

    const publicPayload: any = {
      id: user.id,
      email: user.email,
      full_name: typeof updates.full_name === 'string' ? updates.full_name.trim() : undefined,
      phone: typeof updates.phone === 'string' ? updates.phone.trim() : undefined,
    };

    const { error: publicError } = await supabase.from('users').upsert(publicPayload, { onConflict: 'id' });

    const metaPayload = {
      full_name: updates.full_name || '',
      phone: updates.phone || '',
      rep_name_for_ai: updates.rep_name_for_ai || '',
      company_name: updates.company_name || '',
      username: updates.username || undefined,
      industry: updates.industry || undefined,
      plan: updates.plan || undefined,
    };
    const { error: authError } = await supabase.auth.updateUser({ data: metaPayload });

    if (publicError && authError) throw new Error(publicError.message || authError.message || 'Unable to update profile.');
    if (authError && !publicError) throw authError;
    if (publicError && !authError) throw publicError;
    return true;
  },

  resetPassword: async (identifier: string) => {
    const usernameInput = String(identifier || '').trim().toLowerCase();
    if (!usernameInput) throw new Error('Enter your username first.');
    if (usernameInput.includes('@')) throw new Error('Enter your username, not your email.');
    const { data: profile, error: lookupError } = await supabase
      .from('users').select('email').eq('username', usernameInput).maybeSingle();
    if (lookupError) throw new Error('Connection error. Try again.');
    if (!profile?.email) throw new Error(`Username "${usernameInput}" not found.`);
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email);
    if (error) throw new Error('Unable to send reset instructions right now.');
    return profile.email;
  },
};

// ─── CONTACT SERVICE ──────────────────────────────────────────────────────────
export const contactService = {
  getLocalMeta: async () => {
    try {
      const raw = AsyncStorage ? await AsyncStorage.getItem(LOCAL_CONTACT_META_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  saveLocalMeta: async (contactId: string, updates: any = {}) => {
    const map = await contactService.getLocalMeta();
    map[contactId] = { ...(map[contactId] || {}), ...updates };
    if (AsyncStorage) await AsyncStorage.setItem(LOCAL_CONTACT_META_KEY, JSON.stringify(map));
    return map[contactId];
  },

  mergeRowWithLocal: (row: any, localMap: any = {}) => {
    if (!row) return row;
    const local = localMap[row.id] || {};
    return {
      ...row, ...local,
      notes: typeof local.notes === 'string' ? local.notes : row.notes,
      photo_uri: local.photo_uri || row.photo_uri || null,
      is_deleted: typeof local.is_deleted === 'boolean' ? local.is_deleted : !!row.is_deleted,
    };
  },

  mergeRowsWithLocal: async (rows: any[] = []) => {
    const localMap = await contactService.getLocalMeta();
    return (rows || [])
      .map(row => contactService.mergeRowWithLocal(row, localMap))
      .filter(row => !row?.is_deleted);
  },

  getAll: async ({ search = '', stage = 'all', tags = [] }: { search?: string; stage?: string; tags?: string[] } = {}) => {
    let q = supabase.from('contacts').select('*').eq('is_deleted', false).order('heat_score', { ascending: false });
    if (stage !== 'all') q = (q as any).eq('stage', stage);
    if (tags.length > 0) q = (q as any).overlaps('tags', tags);
    const { data, error } = await q;
    if (error) throw error;
    const rows = await contactService.mergeRowsWithLocal(data || []);
    const needle = String(search || '').trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((c: any) =>
      [c.first_name, c.last_name, c.phone, c.email, c.notes, c.product, ...(c.tags || [])].some(
        (value: any) => String(value || '').toLowerCase().includes(needle)
      )
    );
  },

  getTopByHeatScore: async (limit = 5) => {
    const { data, error } = await supabase
      .from('contacts').select('*').eq('is_deleted', false).neq('stage', 'lost')
      .order('heat_score', { ascending: false }).limit(limit);
    if (error) throw error;
    const rows = await contactService.mergeRowsWithLocal(data || []);
    return rows.slice(0, limit);
  },

  getById: async (id: string) => {
    const { data, error } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const localMap = await contactService.getLocalMeta();
    return contactService.mergeRowWithLocal(data, localMap);
  },

  getAllTags: async () => {
    const [remote, localMap] = await Promise.all([
      supabase.from('contacts').select('tags').eq('is_deleted', false),
      contactService.getLocalMeta(),
    ]);
    if (remote.error) return [];
    const all: string[] = [];
    (remote.data || []).forEach((c: any) => (c.tags || []).forEach((t: string) => { if (t && !all.includes(t)) all.push(t); }));
    Object.values(localMap || {}).forEach((c: any) => (c?.tags || []).forEach((t: string) => { if (t && !all.includes(t)) all.push(t); }));
    return all.sort();
  },

  create: async (contact: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const payload = { ...contact, user_id: user.id };
    const { data, error } = await supabase.from('contacts').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  update: async (id: string, updates: any) => {
    const { data, error } = await supabase.from('contacts').update(updates).eq('id', id).select().maybeSingle();
    if (error) throw error;
    if (data) return data;
    const fallback = await contactService.getById(id);
    return { ...(fallback || {}), ...updates };
  },

  saveNotes: async (id: string, notes: string) => {
    const cleanNotes = String(notes || '');
    await contactService.saveLocalMeta(id, { notes: cleanNotes });
    try { await supabase.from('contacts').update({ notes: cleanNotes }).eq('id', id); } catch {}
    return contactService.getById(id);
  },

  savePhoto: async (id: string, photo_uri: string | null) => {
    await contactService.saveLocalMeta(id, { photo_uri: photo_uri || null });
    try { await supabase.from('contacts').update({ photo_uri: photo_uri || null }).eq('id', id); } catch {}
    return contactService.getById(id);
  },

  softDelete: async (contact: any) => {
    if (!contact?.id) throw new Error('Missing contact id.');
    await contactService.saveLocalMeta(contact.id, { is_deleted: true, deleted_at: new Date().toISOString() });
    try {
      const { error } = await supabase.from('contacts').update({ is_deleted: true }).eq('id', contact.id);
      if (error) throw error;
      return { persisted: 'database' };
    } catch {
      return { persisted: 'local' };
    }
  },

  checkDuplicate: async (phone: string) => {
    const { data, error } = await supabase.from('contacts')
      .select('id,first_name,last_name').eq('phone', phone).eq('is_deleted', false).limit(1).maybeSingle();
    if (error) throw error;
    const localMap = await contactService.getLocalMeta();
    if (data && localMap?.[data.id]?.is_deleted) return null;
    return data;
  },
};

// ─── INTERACTION SERVICE ──────────────────────────────────────────────────────
export const interactionService = {
  getByContact: async (contactId: string) => {
    const { data, error } = await supabase.from('interactions').select('*')
      .eq('contact_id', contactId).order('interaction_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  create: async (interaction: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('interactions')
      .insert({ ...interaction, user_id: user.id }).select().single();
    if (error) throw error;
    await supabase.from('contacts').update({ last_contact_date: new Date().toISOString().split('T')[0] }).eq('id', interaction.contact_id);
    return data;
  },
};

// ─── LOCAL SEQUENCE STORE ─────────────────────────────────────────────────────
export const localSequenceStore = {
  get: async () => {
    try {
      const raw = AsyncStorage ? await AsyncStorage.getItem(LOCAL_SEQUENCE_STORAGE_KEY) : null;
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  save: async (rows: any[]) => {
    try { if (AsyncStorage) await AsyncStorage.setItem(LOCAL_SEQUENCE_STORAGE_KEY, JSON.stringify(rows || [])); } catch {}
  },
};

export const archivedSequenceStore = {
  get: async () => {
    try {
      const raw = AsyncStorage ? await AsyncStorage.getItem(LOCAL_ARCHIVED_SEQ_IDS_KEY) : null;
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  save: async (ids: string[]) => {
    try { if (AsyncStorage) await AsyncStorage.setItem(LOCAL_ARCHIVED_SEQ_IDS_KEY, JSON.stringify(ids || [])); } catch {}
  },
  add: async (id: string) => {
    const ids = await archivedSequenceStore.get();
    if (!ids.includes(id)) { ids.push(id); await archivedSequenceStore.save(ids); }
    return ids;
  },
};

// ─── SEQUENCE SERVICE ─────────────────────────────────────────────────────────
export const sequenceService = {
  sortSteps: (rows: any[]) => (rows || [])
    .map(s => ({ ...s, sequence_steps: (s.sequence_steps || []).sort((a: any, b: any) => a.step_number - b.step_number) }))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),

  filterArchived: async (rows: any[]) => {
    const archivedIds = await archivedSequenceStore.get();
    return (rows || []).filter(row => !archivedIds.includes(row.id));
  },

  getAll: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const localMine = sequenceService.sortSteps(await localSequenceStore.get());
    if (!user) return sequenceService.filterArchived(mergeSequencesById(DEFAULT_SEQUENCE_TEMPLATES, localMine));
    try {
      const { data, error } = await supabase.from('sequences').select('*,sequence_steps(*)')
        .or(`user_id.eq.${user.id},user_id.is.null`).eq('is_archived', false);
      if (error) throw error;
      const rows = sequenceService.sortSteps(data || []);
      return sequenceService.filterArchived(mergeSequencesById(rows, localMine, DEFAULT_SEQUENCE_TEMPLATES));
    } catch {
      return sequenceService.filterArchived(mergeSequencesById(localMine, DEFAULT_SEQUENCE_TEMPLATES));
    }
  },

  getTemplates: async (industry?: string) => {
    let remoteRows: any[] = [];
    try {
      const { data, error } = await supabase.from('sequences').select('*,sequence_steps(*)').is('user_id', null).eq('is_template', true);
      if (error) throw error;
      remoteRows = sequenceService.sortSteps(data || []);
    } catch {}
    const merged = await sequenceService.filterArchived(mergeSequencesById(remoteRows, DEFAULT_SEQUENCE_TEMPLATES));
    return industry ? merged.filter(s => s.industry === industry) : merged;
  },

  getMine: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const localMine = sequenceService.sortSteps(await localSequenceStore.get());
    if (!user) return sequenceService.filterArchived(localMine);
    try {
      const { data, error } = await supabase.from('sequences').select('*,sequence_steps(*)')
        .eq('user_id', user.id).eq('is_archived', false);
      if (error) throw error;
      return sequenceService.filterArchived(mergeSequencesById(sequenceService.sortSteps(data || []), localMine));
    } catch {
      return sequenceService.filterArchived(localMine);
    }
  },

  create: async (seq: any, steps: any[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    if (!seq?.name?.trim()) throw new Error('Give your sequence a name.');
    const cleanSteps = (steps || []).map((s, i) => ({
      sequence_id: null,
      step_number: i + 1,
      delay_days: Number.isFinite(Number(s?.delay_days)) ? Number(s.delay_days) : 0,
      channel: s?.channel || 'text',
      message_template: (s?.message_template || '').trim(),
      ai_personalize: !!s?.ai_personalize,
    }));
    try {
      const { data: seqData, error: seqErr } = await supabase.from('sequences')
        .insert({ name: seq.name.trim(), industry: seq.industry || 'auto', description: (seq.description || '').trim(), user_id: user.id, is_custom: true, is_template: false })
        .select().single();
      if (seqErr) throw seqErr;
      if (cleanSteps.length > 0) {
        const { error: stepErr } = await supabase.from('sequence_steps').insert(cleanSteps.map(s => ({ ...s, sequence_id: seqData.id })));
        if (stepErr) {
          try { await supabase.from('sequences').delete().eq('id', seqData.id); } catch {}
          throw stepErr;
        }
      }
      return seqData;
    } catch {
      const localMine = await localSequenceStore.get();
      const localSeq = buildLocalSequence(seq, cleanSteps, user.id);
      await localSequenceStore.save([localSeq, ...localMine]);
      return localSeq;
    }
  },

  archive: async (sequence: any) => {
    if (!sequence?.id) throw new Error('Missing sequence id.');
    await archivedSequenceStore.add(sequence.id);
    const localMine = await localSequenceStore.get();
    if (localMine.some((s: any) => s.id === sequence.id)) {
      await localSequenceStore.save(localMine.filter((s: any) => s.id !== sequence.id));
      return { persisted: 'local' };
    }
    if (sequence.is_template) return { persisted: 'local' };
    try {
      const { error } = await supabase.from('sequences').update({ is_archived: true }).eq('id', sequence.id);
      if (error) throw error;
      return { persisted: 'database' };
    } catch {
      return { persisted: 'local' };
    }
  },
};

// ─── SEQUENCE ASSIGNMENT SERVICE ──────────────────────────────────────────────
export const sequenceAssignmentService = {
  getLocalMap: async () => {
    try {
      const raw = AsyncStorage ? await AsyncStorage.getItem(SEQUENCE_ASSIGNMENT_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  getAssignedSequenceId: async (contact: any) => {
    if (contact?.assigned_sequence_id) return contact.assigned_sequence_id;
    if (contact?.sequence_id) return contact.sequence_id;
    if (contact?.current_sequence_id) return contact.current_sequence_id;
    const map = await sequenceAssignmentService.getLocalMap();
    return map[contact?.id] || null;
  },

  assignToContact: async (contactId: string, sequenceId: string) => {
    const dbFields = ['assigned_sequence_id', 'sequence_id', 'current_sequence_id'];
    for (const field of dbFields) {
      try {
        const { error } = await supabase.from('contacts').update({ [field]: sequenceId }).eq('id', contactId);
        if (!error) return { persisted: 'database', field };
      } catch {}
    }
    const map = await sequenceAssignmentService.getLocalMap();
    map[contactId] = sequenceId;
    if (AsyncStorage) await AsyncStorage.setItem(SEQUENCE_ASSIGNMENT_KEY, JSON.stringify(map));
    return { persisted: 'local' };
  },
};

// ─── ENSURE DEFAULT SOLD SEQUENCE ─────────────────────────────────────────────
export const ensureDefaultSoldSequence = async (contact: any) => {
  if (!contact || contact.stage !== 'sold') return;
  try {
    const profile = await authService.getUser().catch(() => null);
    const industry = contact.industry_context || profile?.industry || 'auto';
    const templates = await sequenceService.getTemplates(industry);
    const preferred = templates.find(s => /last month sold customer/i.test(String(s.name || '')))
      || templates.find(s => s.industry === industry)
      || templates[0];
    if (preferred?.id) await sequenceAssignmentService.assignToContact(contact.id, preferred.id);
  } catch {}
};

// ─── AI SERVICE ───────────────────────────────────────────────────────────────
export const aiService = {
  call: async (action: string, params: any = {}) => {
    const session = await authService.getSession();
    if (!session) throw new Error('Not authenticated');
    const res = await fetch(SUPABASE_URL + '/functions/v1/ai-closer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ action, ...params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result || data.results;
  },
  rebuttal: (contact_id: string | null, objection: string) => aiService.call('rebuttal', { contact_id, objection }),
  brief: (contact_id: string) => aiService.call('brief', { contact_id }),
  nextStep: (contact_id: string, interaction_type: string, outcome: string, notes: string) =>
    aiService.call('next-step', { contact_id, interaction_type, outcome, notes }),
  coaching: (contact_id: string | null, chat_history: any[], message: string, attachments: any[] = []) =>
    aiService.call('coaching', { contact_id, chat_history, message, attachments }),
  enhanceMassText: (base_message: string, contact_id: string | null) =>
    aiService.call('mass-text', { base_message, contact_id }),
};

// ─── MASS TEXT HISTORY STORE ──────────────────────────────────────────────────
export const massTextHistoryStore = {
  get: async () => {
    try {
      const r = AsyncStorage ? await AsyncStorage.getItem(MASS_TEXT_HISTORY_KEY) : null;
      return r ? JSON.parse(r) : [];
    } catch { return []; }
  },
  add: async (entry: any) => {
    try {
      const history = await massTextHistoryStore.get();
      const updated = [{ ...entry, id: `mt-${Date.now()}`, sent_at: new Date().toISOString() }, ...history].slice(0, 20);
      if (AsyncStorage) await AsyncStorage.setItem(MASS_TEXT_HISTORY_KEY, JSON.stringify(updated));
    } catch {}
  },
};
