// ─── Retell Webhook ───────────────────────────────────────────────────────────

export interface RetellCustomAnalysisData {
  score?: 'HOT' | 'WARM' | 'COLD';
  intent?: 'BUYER' | 'SELLER';
  budget?: string;
  timeline?: string;
  preferredAreas?: string;
}

export interface RetellWebhookPayload {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: {
    call_id: string;
    agent_id: string;
    from_number?: string;
    transcript?: string;
    call_analysis?: {
      call_summary?: string;
      custom_analysis_data?: RetellCustomAnalysisData;
    };
  };
}

// ─── Lead ─────────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string;
  spaceId: string;
  callId: string;
  phone: string;
  score: 'HOT' | 'WARM' | 'COLD';
  intent: 'BUYER' | 'SELLER' | 'UNKNOWN';
  budget: string | null;
  timeline: string | null;
  preferredAreas: string | null;
  transcriptSummary: string | null;
  transcript: string | null;
  createdAt: string;
}

// ─── Agent Config (form submission) ──────────────────────────────────────────

export interface AgentConfig {
  telephonyType: 'RETELL_MANAGED' | 'TWILIO';
  // Retell-managed path
  areaCode?: string;
  // Twilio path
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioFriendlyName?: string;
  // Agent customisation
  greetingText: string;
  primaryMarket: string;
  brokerageName: string;
}

// ─── Agent Status ─────────────────────────────────────────────────────────────

export interface AgentStatusData {
  id: string;
  retellAgentId: string;
  phoneNumber: string;
  telephonyType: 'RETELL_MANAGED' | 'TWILIO';
  status: 'PENDING' | 'ACTIVE' | 'ERROR';
  greetingText: string;
  brokerageName: string;
  primaryMarket: string;
  createdAt: string;
}
