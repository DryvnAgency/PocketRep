export interface ScrapedCustomer {
  externalId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  vehicle: string | null;
  lastContactedAt: string | null;
  status: string | null;
  source: string | null;
  rawContext: string | null;
}

export interface ScrapePayload {
  dealerId: string;
  platform: 'vinsolutions' | 'tekion' | 'cdk' | 'dealersocket';
  scrapedAt: string;
  customers: ScrapedCustomer[];
}

export type DraftStatus = 'pending' | 'approved' | 'sent' | 'rejected' | 'failed';

export interface DraftSMS {
  id: string;
  customerId: string;
  body: string;
  status: DraftStatus;
  generatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  twilioSid: string | null;
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
