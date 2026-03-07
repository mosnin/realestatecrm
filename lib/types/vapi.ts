// ── Agent Configuration ──

export interface AgentConfig {
  areaCode?: string;
  greeting: string;
  market: string;
  brokerageName: string;
}

// ── Vapi Webhook Payload ──

export interface VapiWebhookPayload {
  message: {
    type:
      | 'end-of-call-report'
      | 'status-update'
      | 'transcript'
      | 'tool-calls'
      | 'assistant-request'
      | 'hang'
      | 'conversation-update';
    endedReason?: string;
    call?: VapiCallObject;
    artifact?: {
      transcript?: string;
      messages?: VapiMessage[];
      recording?: { url?: string };
      recordingUrl?: string;
    };
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
      successEvaluation?: string;
    };
    status?: string;
  };
}

export interface VapiCallObject {
  id: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status: string;
  assistantId?: string;
  phoneNumberId?: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  phoneCallProvider?: string;
  costBreakdown?: {
    total?: number;
  };
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
  };
  artifact?: {
    transcript?: string;
    messages?: VapiMessage[];
    recording?: { url?: string };
    recordingUrl?: string;
  };
}

export interface VapiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  message: string;
  time?: number;
  endTime?: number;
  secondsFromStart?: number;
  duration?: number;
}

// ── Lead ──

export interface Lead {
  id: string;
  spaceId: string;
  callId: string;
  phone: string;
  score: 'HOT' | 'WARM' | 'COLD';
  intent: 'BUYER' | 'SELLER' | 'BOTH' | null;
  budget: string | null;
  timeline: string | null;
  preferredAreas: string[];
  preApproved: boolean;
  transcriptSummary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  callDuration: number | null;
  createdAt: string | Date;
}

// ── Conversation ──

export interface Conversation {
  id: string;
  spaceId: string;
  vapiCallId: string;
  type: 'VOICE_INBOUND' | 'VOICE_OUTBOUND' | 'SMS';
  status: string;
  phone: string | null;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  durationSeconds: number | null;
  summary: string | null;
  transcript: string | null;
  messages: VapiMessage[] | null;
  recordingUrl: string | null;
  cost: number | null;
  createdAt: string | Date;
}

// ── Vapi Agent Record ──

export interface VapiAgentRecord {
  id: string;
  spaceId: string;
  vapiAssistantId: string;
  vapiPhoneNumberId: string | null;
  phoneNumber: string;
  twilioSid: string | null;
  greeting: string | null;
  market: string | null;
  brokerageName: string | null;
  status: 'ACTIVE' | 'ERROR' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
