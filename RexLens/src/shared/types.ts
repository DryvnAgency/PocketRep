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
  hasAccess: boolean;
}

// ── Page Analysis ───────────────────────────────────────────────────────────

export type PageType = 'email' | 'crm' | 'linkedin' | 'chat' | 'generic';

export interface StructuredTask {
  customerName: string;
  vehicle: string;
  status: string;
  source: string;
  age: string;
  taskDescription: string;
  section: string;
  template: string;
  phone?: string;
  email?: string;
  rawContext?: string;
}

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
  structuredTasks?: StructuredTask[];
  adapterPlatform?: string;
  customerDetail?: CustomerDetail;
}

// ── Customer Detail (per-lead view) ────────────────────────────────────────

export interface VehicleOfInterest {
  year: string;
  make: string;
  model: string;
  trim?: string;
  stock?: string;
  condition?: 'New' | 'Used' | 'CPO';
}

export interface TradeIn {
  year: string;
  make: string;
  model: string;
  vin?: string;
  mileage?: string;
}

export interface ContactEntry {
  type: 'call' | 'email' | 'text' | 'letter' | 'note' | 'visit' | 'other';
  date: string;
  subject?: string;
  snippet?: string;
  direction?: 'in' | 'out';
  replied?: boolean;
}

export interface ServiceRO {
  ro: string;
  vehicle: string;
  dateTime: string;
  vin?: string;
  mileage?: string;
  advisor?: string;
  total?: string;
}

export interface CustomerDetail {
  status: string;
  buyerName: string;
  coBuyer?: string;
  created: string;
  source: string;
  salesRep?: string;
  bdAgent?: string;
  manager?: string;
  contacted: boolean;
  lastAttempt?: string;
  engagement?: 'High' | 'Medium' | 'Low' | '';
  process?: string;
  suggestedAction?: string;
  notes?: string[];
  voi: VehicleOfInterest | null;
  trade: TradeIn | null;
  contactHistory: ContactEntry[];
  serviceHistory: ServiceRO[];
}

export interface FormField {
  selector: string;
  label: string;
  type: 'input' | 'textarea' | 'contenteditable';
  currentValue: string;
}

// ── Clickable Contact ──────────────────────────────────────────────────────

export interface ClickableContact {
  name: string;
  selector: string;
  href: string;
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
