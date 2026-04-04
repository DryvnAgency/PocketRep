// ── Rex Lens Account ────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  plan: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface AuthState {
  authenticated: boolean;
  profile: Profile | null;
  hasAccess: boolean; // true when user has a valid Rex Lens account
}

// ── Page Analysis ───────────────────────────────────────────────────────────

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
  deepScan?: DeepScanResult;
}

// ── Deep Scan ──────────────────────────────────────────────────────────────

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
  taskType: 'phone' | 'email' | 'text' | 'sold_followup' | 'service_opportunity' | 'notification' | 'unknown';
  vehicle: string;
  text: string;
  email: { subject: string; body: string };
  callScript: string;
  book: string;
  dismiss: boolean;
}

export interface DeepScanResult {
  contacts: ContactActionPlan[];
  scannedCount: number;
  totalFound: number;
}
