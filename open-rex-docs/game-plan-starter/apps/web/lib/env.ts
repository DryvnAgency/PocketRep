// Paste-to-activate env helper. Code calls live.X to gate features that
// need a real key. Placeholder values short-circuit gracefully so the app
// boots even before secrets are wired (useful for local + first deploy).

function hasReal(value: string | undefined, prefix: string): boolean {
  if (!value) return false;
  if (value.includes("PLACEHOLDER")) return false;
  if (prefix && !value.startsWith(prefix)) return false;
  return true;
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export const live = {
  supabase:
    hasReal(env.supabaseUrl, "https://") &&
    hasReal(env.supabasePublishableKey, "sb_publishable_"),
  supabaseServer: hasReal(env.supabaseServiceRole, ""),
  anthropic: hasReal(env.anthropicApiKey, "sk-ant-"),
};
