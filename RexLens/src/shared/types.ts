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

// ── Scan Results ────────────────────────────────────────────────────────────

export type TaskType = 'phone' | 'email' | 'text' | 'followup' | 'service' | 'notification';

export interface ScanItem {
  name: string;
  taskType: TaskType;
  product: string;
  urgency: 'high' | 'medium' | 'low';
  context: string;
  script: string;
  dismiss: boolean;
}

export interface ScanResult {
  items: ScanItem[];
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
  taskType: string;
  product: string;
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

// ── Deep Review (Agent Mode) ──────────────────────────────────────────────

export interface DeepReviewLead {
  name: string;
  priority: 'HOT' | 'WARM' | 'COLD' | 'DEAD';
  lastInteraction: string;
  play: string;
  taskType: string;
  script: string;
  product: string;
  skipped?: boolean;
}

export interface DeepReviewResult {
  leads: DeepReviewLead[];
  reviewedCount: number;
  totalFound: number;
}
