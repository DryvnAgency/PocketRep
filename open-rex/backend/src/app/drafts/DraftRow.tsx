'use client';

import { useState } from 'react';

export default function DraftRow({ draft }: { draft: any }) {
  const [body, setBody] = useState(draft.body as string);
  const [status, setStatus] = useState<'idle' | 'saving' | 'approving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const customer = Array.isArray(draft.customers) ? draft.customers[0] : draft.customers;
  const name = customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown';
  const vehicle = customer?.vehicle ?? '—';
  const phone = customer?.phone ?? '—';

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'save failed');
    }
  }

  async function approve() {
    setStatus('approving');
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(`approve failed: ${res.status}`);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'approve failed');
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded border bg-emerald-50 p-3 text-sm">
        Sent to {name}.
      </div>
    );
  }

  return (
    <div className="rounded border bg-white p-4 space-y-2">
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{name} — {vehicle}</span>
        <span>{phone}</span>
      </div>
      <textarea
        className="w-full border rounded p-2 text-sm"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={status === 'saving' || body === draft.body}
          className="text-xs border rounded px-3 py-1 disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Save edit'}
        </button>
        <button
          onClick={approve}
          disabled={status === 'approving'}
          className="text-xs bg-black text-white rounded px-3 py-1 disabled:opacity-50"
        >
          {status === 'approving' ? 'Sending…' : 'Approve + send'}
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
