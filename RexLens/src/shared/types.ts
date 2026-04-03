// ── PocketRep types (mirrored from PocketRepApp/lib/types.ts) ────────────────

export type Plan = 'pro' | 'elite' | 'rex_lens_standalone' | 'elite_bundle';
export type HeatTier = 'hot' | 'warm' | 'watch';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  plan: Plan;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  rex_lens_active?: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  last_contact_date: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  mileage: number | null;
  lease_end_date: string | null;
  annual_mileage: number | null;
  stage: 'prospect' | 'active' | 'sold' | 'dormant' | 'lost' | null;
  heat_tier: HeatTier | null;
  heat_score: number | null;
  heat_reason: string | null;
  rapport_notes: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  amount: number | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

// ── Rex Lens types ───────────────────────────────────────────────────────────

export type PageType = 'email' | 'crm' | 'linkedin' | 'chat' | 'generic';

export interface PageContent {
  type: PageType;
  title: string;
  url: string;
  mainText: string;
  conversations: string[];
  formFields: FormField[];
  contactNames: string[];
  emails: string[];
  phones: string[];
}

export interface FormField {
  selector: string;
  label: string;
  type: 'input' | 'textarea' | 'contenteditable';
  currentValue: string;
}

export interface RexSuggestion {
  situation: string;
  suggestions: string[];
  draftResponse: string | null;
  followUp: string | null;
  matchedContact: Contact | null;
  deepScan?: DeepScanResult;
}

export interface AuthState {
  authenticated: boolean;
  profile: Profile | null;
  hasAccess: boolean; // elite + rex_lens_active
}

// ── Deep Scan types ─────────────────────────────────────────────────────────

export interface ClickableContact {
  name: string;
  selector: string;
  href: string;
}

export interface ContactSummary {
  name: string;
  summary: string;
  sourceUrl: string;
}

export interface ContactActionPlan {
  name: string;
  summary: string;
  text: string;
  email: { subject: string; body: string };
  callScript: string;
  book: string;
}

export interface DeepScanResult {
  contacts: ContactActionPlan[];
  scannedCount: number;
  totalFound: number;
}
