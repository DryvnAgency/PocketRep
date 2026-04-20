export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const health = {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    messagingServiceSid: Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID),
    fromNumber: Boolean(process.env.TWILIO_FROM_NUMBER),
    dealerAlertPhone: Boolean(process.env.DEALER_ALERT_PHONE),
    dashboardAuth: Boolean(process.env.DASHBOARD_AUTH_SECRET),
  };

  return (
    <div className="px-8 py-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-mute-300 text-sm mt-1">Environment health. Values are stored in Vercel / <code className="font-mono text-xs">.env.local</code>.</p>
      </header>

      <div className="rounded-xl border border-ink-700 bg-ink-800 divide-y divide-ink-700">
        <Row label="Supabase (URL + service role)" ok={health.supabase} />
        <Row label="Gemini API key" ok={health.gemini} />
        <Row label="Twilio account + auth token" ok={health.twilio} />
        <Row label="Twilio Messaging Service SID" ok={health.messagingServiceSid} hint="Blank until 10DLC approved" />
        <Row label="Twilio From number" ok={health.fromNumber} />
        <Row label="Dealer alert phone" ok={health.dealerAlertPhone} />
        <Row label="Dashboard auth secret" ok={health.dashboardAuth} />
      </div>
    </div>
  );
}

function Row({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-mute-400 mt-0.5">{hint}</div>}
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          ok
            ? 'bg-success/15 text-success border border-success/25'
            : 'bg-ink-900 text-mute-400 border border-ink-700'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success' : 'bg-mute-400'}`}></span>
        {ok ? 'Set' : 'Missing'}
      </span>
    </div>
  );
}
