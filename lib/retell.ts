import Retell from 'retell-sdk';
import crypto from 'crypto';

const globalForRetell = globalThis as unknown as {
  retell: Retell | undefined;
};

function getRetellClient(): Retell {
  if (globalForRetell.retell) {
    return globalForRetell.retell;
  }

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    throw new Error('RETELL_API_KEY not configured');
  }

  const client = new Retell({ apiKey });

  if (process.env.NODE_ENV !== 'production') {
    globalForRetell.retell = client;
  }

  return client;
}

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

export async function createRetellAgent(config: {
  greeting: string;
  market: string;
  brokerageName: string;
  spaceId: string;
}) {
  const retell = getRetellClient();

  // Create a Retell LLM with lead qualification prompt
  const llm = await retell.llm.create({
    general_prompt: buildAgentPrompt(config),
    begin_message: config.greeting,
    model: 'claude-4.5-sonnet',
    general_tools: [
      {
        type: 'end_call',
        name: 'end_call',
        description: 'End the call when the conversation is complete.',
      },
    ],
  });

  // Create the agent using the LLM via response_engine
  const agent = await retell.agent.create({
    response_engine: {
      type: 'retell-llm',
      llm_id: llm.llm_id,
    },
    agent_name: `${config.brokerageName} - ${config.market} [${config.spaceId}]`,
    voice_id: '11labs-Adrian',
    language: 'en-US',
    post_call_analysis_data: [
      {
        type: 'string' as const,
        name: 'lead_score',
        description:
          'Rate the lead as HOT (ready to act within 30 days, has budget), WARM (interested but 1-6 months out), or COLD (just exploring, no timeline).',
      },
      {
        type: 'string' as const,
        name: 'intent',
        description: 'Is the caller a BUYER, SELLER, or BOTH?',
      },
      {
        type: 'string' as const,
        name: 'budget',
        description:
          'The budget range mentioned by the lead, e.g. "$400k-$600k".',
      },
      {
        type: 'string' as const,
        name: 'timeline',
        description:
          'When does the lead want to buy/sell? e.g. "within 3 months".',
      },
      {
        type: 'string' as const,
        name: 'preferred_areas',
        description:
          'Comma-separated list of preferred areas/neighborhoods mentioned.',
      },
      {
        type: 'boolean' as const,
        name: 'pre_approved',
        description: 'Is the lead pre-approved for a mortgage?',
      },
    ],
  });

  return { agent, llm };
}

export async function buyRetellPhoneNumber(
  agentId: string,
  areaCode?: string
) {
  const retell = getRetellClient();

  const phoneNumber = await retell.phoneNumber.create({
    inbound_agent_id: agentId,
    area_code: areaCode ? parseInt(areaCode) : undefined,
  });
  return phoneNumber;
}

export async function importTwilioPhoneNumber(
  agentId: string,
  phoneNumber: string,
  twilioAccountSid: string,
  twilioAuthToken: string
) {
  const retell = getRetellClient();

  // Construct the Twilio SIP trunk termination URI
  const terminationUri = `${twilioAccountSid}.pstn.twilio.com`;

  const imported = await retell.phoneNumber.import({
    phone_number: phoneNumber,
    termination_uri: terminationUri,
    inbound_agent_id: agentId,
  });
  return imported;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  apiKey: string
): boolean {
  const hash = crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex');
  return hash === signature;
}
