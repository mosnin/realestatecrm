export interface AgentConfig {
  telephonyType: 'RETELL_MANAGED' | 'TWILIO';
  // Retell-managed options
  areaCode?: string;
  // Twilio options
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioFriendlyName?: string;
  // Agent customization
  greeting: string;
  market: string;
  brokerageName: string;
}

export interface RetellWebhookPayload {
  event: 'call_ended' | 'call_analyzed' | 'call_started';
  call: {
    call_id: string;
    agent_id: string;
    from_number: string;
    to_number: string;
    direction: 'inbound' | 'outbound';
    call_status: string;
    start_timestamp: number;
    end_timestamp: number;
    duration_ms: number;
    recording_url?: string;
    transcript?: string;
    transcript_object?: Array<{
      role: 'agent' | 'user';
      content: string;
    }>;
    call_analysis?: {
      call_summary?: string;
      custom_analysis_data?: Record<string, unknown>;
    };
    metadata?: Record<string, string>;
    retell_llm_dynamic_variables?: Record<string, string>;
  };
}

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
  createdAt: Date;
}

export interface RetellAgentRecord {
  id: string;
  spaceId: string;
  retellAgentId: string;
  phoneNumber: string;
  telephonyType: 'RETELL_MANAGED' | 'TWILIO';
  greeting: string | null;
  market: string | null;
  brokerageName: string | null;
  status: 'ACTIVE' | 'ERROR' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
