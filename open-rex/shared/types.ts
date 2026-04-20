export interface ScrapedCustomer {
  externalId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  // Vehicle-of-interest or primary-vehicle label from the list view
  vehicle: string | null;
  // Time since last touch, free-text from the CRM (normalised later)
  lastContactedAt: string | null;
  status: string | null;
  source: string | null;
  rawContext: string | null;

  // Rich profile fields (populated from the detail-page fetch)
  notes: string | null;
  interactionHistory: string | null;
  tradeInVehicle: string | null;
  purchasedVehicle: string | null;
  purchaseDate: string | null;
  lastContactDate: string | null;
}

export interface ScrapePayload {
  dealerId: string;
  platform: 'vinsolutions' | 'tekion' | 'cdk' | 'dealersocket';
  scrapedAt: string;
  customers: ScrapedCustomer[];
}

export type DraftStatus = 'pending' | 'approved' | 'sent' | 'rejected' | 'failed';

export type OutreachAngle =
  | 'check_in'
  | 'mileage_prompt'
  | 'service_frame'
  | 'lease_aware'
  | 'time_lapse'
  | 'neighbor_check';

export interface DraftSMS {
  id: string;
  customerId: string;
  body: string;
  status: DraftStatus;
  generatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  twilioSid: string | null;
  angle: OutreachAngle | null;
}

export interface InboundMessage {
  id: string;
  customerId: string;
  body: string;
  receivedAt: string;
  twilioSid: string;
}

export interface Conversation {
  customerId: string;
  customerName: string;
  vehicle: string | null;
  messages: Array<{
    direction: 'outbound' | 'inbound';
    body: string;
    timestamp: string;
  }>;
}

export type AppointmentSignal = {
  customerId: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  suggestedTime: string | null;
};
