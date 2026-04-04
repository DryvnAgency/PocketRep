export type Plan = 'pro' | 'elite';
export type HeatTier = 'hot' | 'warm' | 'watch';

export type IndustryKey = 'auto' | 'mortgage' | 'realestate' | 'hvac' | 'staffing' | 'd2d' | 'roofing' | 'fence' | 'insurance' | 'solar' | 'b2b' | 'other';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  plan: Plan;
  industry: IndustryKey;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
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
  // Vehicle info
  purchase_date: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  mileage: number | null;
  lease_end_date: string | null;
  annual_mileage: number | null;
  // Stage
  stage: 'prospect' | 'active' | 'sold' | 'dormant' | 'lost' | null;
  // Heat Sheet
  heat_tier: HeatTier | null;
  heat_score: number | null;
  heat_reason: string | null;
  // Elite features
  lat: number | null;
  lng: number | null;
  rapport_notes: string | null;
  rapport_image_url: string | null;
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
  front_gross: number | null;
  back_gross: number | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface RexMessage {
  id: string;
  user_id: string;
  contact_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface RexMemory {
  id: string;
  user_id: string;
  summary: string;
  message_count: number;
  updated_at: string;
}

export interface DigestEntry {
  week_start: string;
  contacts_added: number;
  deals_logged: number;
  heat_sheet_calls: number;
  top_deal_amount: number | null;
}

export type Stage = 'prospect' | 'active' | 'sold' | 'dormant' | 'lost';

export interface Sequence {
  id: string;
  name: string;
  industry: string;
  description: string;
  user_id: string | null;
  is_template: boolean;
  is_custom: boolean;
  created_at: string;
  sequence_steps: SequenceStep[];
}

export interface SequenceStep {
  id: string;
  sequence_id: string | null;
  step_number: number;
  delay_days: number;
  channel: 'text' | 'call' | 'email';
  message_template: string;
  ai_personalize: boolean;
}

export interface Interaction {
  id: string;
  user_id: string;
  contact_id: string;
  type: 'call' | 'text' | 'email' | 'visit' | 'note';
  outcome: string | null;
  notes: string | null;
  interaction_date: string;
  created_at: string;
}
