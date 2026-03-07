import type { VapiCallObject } from '@/lib/types/vapi';

const VAPI_API_BASE = 'https://api.vapi.ai';

function getHeaders() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error('VAPI_API_KEY is not configured');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function vapiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${VAPI_API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi API error (${res.status}): ${body}`);
  }

  return res.json();
}

// ── Lead Qualification Prompt Template ──

const BASE_AGENT_PROMPT = `You are an AI real estate assistant for {{brokerage_name}}, specializing in the {{market}} market.

Your job is to qualify inbound leads by gathering the following information:
1. Are they looking to buy or sell (or both)?
2. What is their budget range?
3. What is their timeline (e.g., "within 3 months", "just exploring")?
4. Are they pre-approved for a mortgage? (buyers only)
5. What areas/neighborhoods are they interested in?
6. Any specific property requirements (beds, baths, property type)?

Be friendly, professional, and conversational. Do not sound robotic.
If they seem ready, offer to schedule a call with a human agent.
Summarize the conversation at the end.

Always identify yourself with: "{{greeting}}"`;

export function buildAgentPrompt(config: {
  greeting: string;
  market: string;
  brokerageName: string;
}): string {
  return BASE_AGENT_PROMPT.replace('{{greeting}}', config.greeting)
    .replace('{{brokerage_name}}', config.brokerageName)
    .replace('{{market}}', config.market);
}

// ── Assistant Management ──

interface CreateAssistantResponse {
  id: string;
  name: string;
  [key: string]: unknown;
}

export async function createVapiAssistant(config: {
  greeting: string;
  market: string;
  brokerageName: string;
  spaceId: string;
}): Promise<CreateAssistantResponse> {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/vapi-webhook`;

  return vapiRequest<CreateAssistantResponse>('/assistant', {
    method: 'POST',
    body: JSON.stringify({
      name: `${config.brokerageName} - ${config.market}`,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: buildAgentPrompt(config),
          },
        ],
      },
      voice: {
        provider: '11labs',
        voiceId: 'burt',
      },
      transcriber: {
        provider: 'deepgram',
        model: 'nova-3',
        language: 'en',
      },
      firstMessage: config.greeting,
      server: {
        url: webhookUrl,
      },
      analysisPlan: {
        summaryPlan: {
          enabled: true,
        },
        structuredDataPlan: {
          enabled: true,
          schema: {
            type: 'object',
            properties: {
              lead_score: {
                type: 'string',
                description:
                  'Rate the lead: HOT (ready to act within 30 days, has budget), WARM (interested but 1-6 months out), COLD (just exploring).',
              },
              intent: {
                type: 'string',
                description:
                  'Is the caller a BUYER, SELLER, or BOTH?',
              },
              budget: {
                type: 'string',
                description:
                  'The budget range mentioned, e.g. "$400k-$600k".',
              },
              timeline: {
                type: 'string',
                description:
                  'When do they want to buy/sell? e.g. "within 3 months".',
              },
              preferred_areas: {
                type: 'string',
                description:
                  'Comma-separated list of preferred areas/neighborhoods.',
              },
              pre_approved: {
                type: 'boolean',
                description: 'Is the lead pre-approved for a mortgage?',
              },
            },
          },
        },
      },
      metadata: {
        spaceId: config.spaceId,
      },
    }),
  });
}

export async function updateVapiAssistant(
  assistantId: string,
  updates: Record<string, unknown>
): Promise<CreateAssistantResponse> {
  return vapiRequest<CreateAssistantResponse>(
    `/assistant/${assistantId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}

// ── Phone Number Management ──

interface PhoneNumberResponse {
  id: string;
  number: string;
  status: string;
  [key: string]: unknown;
}

export async function buyTwilioNumber(
  areaCode?: string
): Promise<{ sid: string; phoneNumber: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  const params = new URLSearchParams();
  if (areaCode) params.set('AreaCode', areaCode);
  params.set('VoiceEnabled', 'true');
  params.set('SmsEnabled', 'true');

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twilio error (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    sid: data.sid,
    phoneNumber: data.phone_number,
  };
}

export async function importTwilioNumberToVapi(
  phoneNumber: string,
  assistantId: string
): Promise<PhoneNumberResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  return vapiRequest<PhoneNumberResponse>('/phone-number', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'twilio',
      number: phoneNumber,
      twilioAccountSid: accountSid,
      twilioAuthToken: authToken,
      assistantId,
      smsEnabled: true,
      name: 'Lead Qualification Line',
    }),
  });
}

// ── Call History ──

export async function listVapiCalls(
  assistantId: string,
  opts?: { limit?: number; createdAtGt?: string }
): Promise<VapiCallObject[]> {
  const params = new URLSearchParams();
  params.set('assistantId', assistantId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.createdAtGt) params.set('createdAtGt', opts.createdAtGt);

  return vapiRequest<VapiCallObject[]>(`/call?${params.toString()}`);
}

export async function getVapiCall(
  callId: string
): Promise<VapiCallObject> {
  return vapiRequest<VapiCallObject>(`/call/${callId}`);
}
