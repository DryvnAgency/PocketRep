'use client';

import { useMemo, useState } from 'react';

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  vehicle: string | null;
  last_contacted_at: string | null;
  status: string | null;
  source: string | null;
};

type Draft = {
  id: string;
  customerId: string;
  body: string;
  generatedAt: string;
  isAppointmentSignal: boolean;
  customer: Customer | null;
};

export default function DraftsWorkspace({ initialDrafts }: { initialDrafts: Draft[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [selectedId, setSelectedId] = useState<string | null>(initialDrafts[0]?.id ?? null);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => drafts.find((d) => d.id === selectedId) ?? null,
    [drafts, selectedId],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return drafts;
    const q = query.toLowerCase();
    return drafts.filter((d) => {
      const name = `${d.customer?.first_name ?? ''} ${d.customer?.last_name ?? ''}`.toLowerCase();
      return (
        name.includes(q) ||
        d.body.toLowerCase().includes(q) ||
        (d.customer?.vehicle ?? '').toLowerCase().includes(q)
      );
    });
  }, [drafts, query]);

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setSelectedId((curr) => {
      if (curr !== id) return curr;
      const remaining = drafts.filter((d) => d.id !== id);
      return remaining[0]?.id ?? null;
    });
  }

  function updateDraftBody(id: string, body: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, body } : d)));
  }

  return (
    <div className="flex h-screen min-h-0">
      {/* Col 1 — Drafts list */}
      <section className="w-[340px] shrink-0 bg-ink-900 border-r border-ink-700 flex flex-col min-h-0">
        <div className="px-5 pt-5 pb-3">
          <button className="w-full rounded-xl bg-rex-gradient py-2.5 text-sm font-semibold shadow-rex-glow">
            My Drafts
          </button>
        </div>
        <div className="px-5 pb-3 flex items-center gap-2">
          <div className="flex-1 relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-mute-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drafts"
              className="w-full bg-ink-800 border border-ink-700 rounded-xl pl-9 pr-3 py-2 text-sm placeholder:text-mute-400 focus:outline-none focus:border-rex-purple"
            />
          </div>
          <button className="w-9 h-9 rounded-xl border border-ink-700 bg-ink-800 flex items-center justify-center text-mute-300 hover:text-white">
            <FilterIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-3">
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-2 text-sm">
            <div className="flex items-center gap-2">
              <InboxIcon className="w-4 h-4 text-rex-pink2" />
              <span>Pending</span>
            </div>
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-rex-pink text-white text-xs font-semibold">
              {filtered.length}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {filtered.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-mute-300">
              No drafts. Run the extension on your CRM to generate some.
            </div>
          )}
          {filtered.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              active={d.id === selectedId}
              onClick={() => setSelectedId(d.id)}
            />
          ))}
        </div>
      </section>

      {/* Col 2 — Thread + composer */}
      <section className="flex-1 min-w-0 flex flex-col bg-ink-950">
        {selected ? (
          <SelectedDraft
            draft={selected}
            onSent={() => removeDraft(selected.id)}
            onRejected={() => removeDraft(selected.id)}
            onEdit={(body) => updateDraftBody(selected.id, body)}
          />
        ) : (
          <EmptyThread />
        )}
      </section>

      {/* Col 3 — Customer detail */}
      <aside className="w-[320px] shrink-0 bg-ink-900 border-l border-ink-700 overflow-y-auto">
        {selected?.customer ? (
          <CustomerPanel customer={selected.customer} appointmentFlag={selected.isAppointmentSignal} />
        ) : null}
      </aside>
    </div>
  );
}

function DraftCard({ draft, active, onClick }: { draft: Draft; active: boolean; onClick: () => void }) {
  const c = draft.customer;
  const time = new Date(draft.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const name = c ? `${c.first_name} ${c.last_name}` : 'Unknown';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3.5 transition-all ${
        active
          ? 'border-rex-purple bg-ink-700 shadow-[inset_3px_0_0_0_#e05272]'
          : 'border-ink-700 bg-ink-800 hover:border-ink-600 hover:bg-ink-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 shrink-0 rounded-full bg-success/20 flex items-center justify-center">
            <MsgIcon className="w-3.5 h-3.5 text-success" />
          </span>
          <span className="font-semibold text-sm truncate">{name}</span>
        </div>
        <span className="text-[11px] text-mute-300 shrink-0">{time}</span>
      </div>
      <div className="text-sm text-mute-200 line-clamp-2 mb-1.5">{draft.body}</div>
      {c?.vehicle && (
        <div className="text-[11px] text-mute-400 truncate">{c.vehicle}</div>
      )}
      {draft.isAppointmentSignal && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-rex-pink/15 text-rex-pink2 px-2 py-0.5 text-[10px] font-semibold">
          APPOINTMENT SIGNAL
        </div>
      )}
    </button>
  );
}

function SelectedDraft({
  draft,
  onSent,
  onRejected,
  onEdit,
}: {
  draft: Draft;
  onSent: () => void;
  onRejected: () => void;
  onEdit: (body: string) => void;
}) {
  const c = draft.customer;
  const [body, setBody] = useState(draft.body);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<{ mimeType: string; dataBase64: string; name: string; preview: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const changed = body !== draft.body;
  const name = c ? `${c.first_name} ${c.last_name}` : 'Unknown';

  async function onPickImage(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setErr('image too large (max 4MB)');
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const preview = `data:${file.type};base64,${b64}`;
    setImage({ mimeType: file.type, dataBase64: b64, name: file.name, preview });
  }

  async function generate() {
    if (!notes.trim() && !image) {
      setErr('add notes or an image first');
      return;
    }
    setGenerating(true);
    setErr(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          image: image ? { mimeType: image.mimeType, dataBase64: image.dataBase64 } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `generate failed: ${res.status}`);
      setBody(json.body);
      onEdit(json.body);
      setNotes('');
      setImage(null);
      setNotesOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'generate failed');
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      onEdit(body);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (changed) {
      await save();
    }
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(`approve failed: ${res.status}`);
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'approve failed');
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex items-center justify-between px-6 h-[60px] border-b border-ink-700">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-white">{name}</h2>
          <span className="inline-flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs text-mute-200">
            Open Profile
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onRejected();
              // Fire-and-forget server call to mark rejected (endpoint not yet implemented; swallow)
            }}
            className="rounded-lg border border-ink-700 bg-ink-800 hover:bg-ink-700 px-3 py-1.5 text-xs font-medium text-mute-200"
          >
            Skip
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex justify-center text-[11px] uppercase tracking-wider text-mute-400">
            Draft · {new Date(draft.generatedAt).toLocaleString()}
          </div>
          {/* Draft bubble (outgoing style) */}
          <div className="flex justify-end">
            <div className="max-w-[78%]">
              <div className="rounded-2xl rounded-br-sm bg-rex-gradient-soft border border-rex-purple/30 px-4 py-3 text-sm text-white whitespace-pre-wrap">
                {draft.body}
              </div>
              <div className="mt-1 text-right text-[10px] text-mute-400">
                will send to {c?.phone ?? '<no phone>'}
              </div>
            </div>
          </div>
          {draft.isAppointmentSignal && (
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-rex-pink/15 border border-rex-pink/30 px-3 py-1 text-[11px] font-semibold text-rex-pink2">
                Appointment signal detected — dealer will be alerted on send
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-ink-700 bg-ink-900 px-6 pt-4 pb-5">
        <div className="max-w-3xl mx-auto">
          <div className="mb-3 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl bg-rex-gradient-soft border border-rex-purple/30 px-3 py-1.5">
              <SparkleIcon className="w-4 h-4 text-rex-purple2" />
              <span className="text-xs font-semibold text-white">AI Draft</span>
              <span className="text-xs font-semibold text-success rex-pulse">Active</span>
            </div>
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                notesOpen
                  ? 'border-rex-purple/50 bg-rex-purple/15 text-white'
                  : 'border-ink-700 bg-ink-800 text-mute-200 hover:bg-ink-700'
              }`}
            >
              <NotesIcon className="w-3.5 h-3.5" />
              {notesOpen ? 'Hide notes' : 'Rewrite from notes'}
            </button>
          </div>

          {notesOpen && (
            <div className="mb-3 rounded-xl border border-ink-700 bg-ink-800/60 p-3">
              <textarea
                className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-sm placeholder:text-mute-400 focus:outline-none focus:border-rex-purple resize-none"
                rows={3}
                placeholder="Notes for Rex — what should the next text say? Prior conversation context, vehicle details, timing, anything specific."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="mt-2.5 flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900 hover:bg-ink-700 px-3 py-1.5 text-xs font-medium cursor-pointer text-mute-200">
                  <ImageIcon className="w-3.5 h-3.5" />
                  {image ? 'Replace image' : 'Attach image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickImage(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {image && (
                  <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1 text-xs text-mute-200">
                    <img src={image.preview} alt="" className="w-7 h-7 object-cover rounded" />
                    <span className="max-w-[140px] truncate">{image.name}</span>
                    <button
                      onClick={() => setImage(null)}
                      className="text-mute-400 hover:text-danger"
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex-1" />
                <button
                  onClick={generate}
                  disabled={generating || (!notes.trim() && !image)}
                  className="rounded-lg bg-rex-gradient px-3.5 py-1.5 text-xs font-semibold text-white shadow-rex-glow disabled:opacity-50"
                >
                  {generating ? 'Generating…' : 'Generate script'}
                </button>
              </div>
            </div>
          )}

          <textarea
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-rex-purple resize-none"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {err && <div className="mt-2 text-xs text-danger">{err}</div>}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-mute-300">
              {body.length} chars · max 320
            </div>
            <div className="flex items-center gap-2">
              {changed && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg border border-ink-700 bg-ink-800 hover:bg-ink-700 px-3.5 py-2 text-xs font-medium text-mute-200 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save edit'}
                </button>
              )}
              <button
                onClick={approve}
                disabled={sending || !c?.phone}
                className="rounded-lg bg-rex-gradient px-4 py-2 text-sm font-semibold text-white shadow-rex-glow disabled:opacity-50"
              >
                {sending ? 'Sending…' : c?.phone ? 'Approve + Send' : 'No phone on record'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyThread() {
  return (
    <div className="flex-1 flex items-center justify-center text-mute-300 text-sm">
      Select a draft to review.
    </div>
  );
}

function CustomerPanel({ customer, appointmentFlag }: { customer: Customer; appointmentFlag: boolean }) {
  const name = `${customer.first_name} ${customer.last_name}`;
  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success rex-pulse"></span>
          Active
        </div>
        <h3 className="mt-1 font-display text-xl font-bold">{name}</h3>
        {customer.phone && <div className="mt-1 text-sm text-mute-200 font-mono">{customer.phone}</div>}
        {customer.email && <div className="mt-0.5 text-sm text-mute-200">{customer.email}</div>}
      </div>

      {appointmentFlag && (
        <div className="rounded-xl border border-rex-pink/30 bg-rex-pink/10 p-3 text-xs text-rex-pink2">
          Appointment-intent detected in this draft.
        </div>
      )}

      <Panel label="Vehicle of interest">
        {customer.vehicle ? (
          <div className="text-sm text-white">{customer.vehicle}</div>
        ) : (
          <div className="text-sm text-mute-400">Not recorded</div>
        )}
      </Panel>

      <Panel label="Last contact">
        <div className="text-sm text-mute-200">
          {customer.last_contacted_at || 'Never'}
        </div>
      </Panel>

      <Panel label="Status">
        <div className="flex flex-wrap gap-1.5">
          {customer.status && (
            <span className="inline-flex rounded-md bg-ink-800 border border-ink-700 px-2 py-0.5 text-xs text-mute-200">
              {customer.status}
            </span>
          )}
          {customer.source && (
            <span className="inline-flex rounded-md bg-ink-800 border border-ink-700 px-2 py-0.5 text-xs text-mute-200">
              {customer.source}
            </span>
          )}
          {!customer.status && !customer.source && (
            <span className="text-sm text-mute-400">No tags</span>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-mute-400 mb-2">{label}</div>
      {children}
    </div>
  );
}

// Icons

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18M6 12h12M10 18h4"/>
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  );
}

function MsgIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1.7 4.8L18.5 8.5l-4.8 1.7L12 15l-1.7-4.8L5.5 8.5l4.8-1.7z"/>
      <path d="M19 14l0.8 2.2L22 17l-2.2 0.8L19 20l-0.8-2.2L16 17l2.2-0.8z"/>
    </svg>
  );
}

function NotesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="13" y2="17"/>
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="9" cy="9" r="1.8"/>
      <path d="m21 15-5-5L5 21"/>
    </svg>
  );
}
