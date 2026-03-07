'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { retell } from '@/lib/retell';
import { getSpaceFromSubdomain } from '@/lib/space';
import type { AgentConfig } from '@/lib/types';

const E164_REGEX = /^\+1[2-9]\d{9}$/;
const AREA_CODE_REGEX = /^\d{3}$/;

// Build a localised real estate qualification prompt
function buildSystemPrompt(cfg: AgentConfig): string {
  return `You are a professional real estate AI assistant for ${cfg.brokerageName}, specialising in the ${cfg.primaryMarket} market.

Your opening greeting: "${cfg.greetingText}"

Your job is to qualify inbound real estate leads by having a natural, friendly conversation. Ask about:
1. Are they looking to buy or sell?
2. What is their approximate budget or listing price?
3. What is their desired timeline (e.g., within 3 months, 6 months, just browsing)?
4. Have they been pre-approved for a mortgage (for buyers)?
5. Which neighborhoods or areas in ${cfg.primaryMarket} interest them?

Keep responses concise and conversational. After the conversation, populate the custom_analysis_data JSON object with:
{
  "score": "HOT" | "WARM" | "COLD",
  "intent": "BUYER" | "SELLER",
  "budget": "<dollar amount or range as string>",
  "timeline": "<timeline as string>",
  "preferredAreas": "<comma-separated neighborhoods>"
}

Score definitions:
- HOT: Ready to act within 30 days, clear intent, pre-approved (buyers) or motivated seller
- WARM: Interested in 1–6 months, some criteria defined
- COLD: Just browsing, no clear timeline or budget`;
}

export type CreateAgentResult =
  | { success: true; phoneNumber: string; agentId: string }
  | { success: false; error: string };

export async function createAgentAction(
  subdomain: string,
  config: AgentConfig
): Promise<CreateAgentResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: 'You must be signed in.' };

  const clerkUser = await currentUser();
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return { success: false, error: 'Workspace not found.' };

  // Idempotency: prevent duplicate agents for the same space
  const existing = await db.retellAgent.findUnique({ where: { spaceId: space.id } });
  if (existing) {
    return { success: true, phoneNumber: existing.phoneNumber, agentId: existing.retellAgentId };
  }

  // Validate inputs
  if (config.telephonyType === 'TWILIO') {
    if (!config.twilioAccountSid?.startsWith('AC')) {
      return { success: false, error: 'Invalid Twilio Account SID (must start with AC).' };
    }
    if (!config.twilioAuthToken) {
      return { success: false, error: 'Twilio Auth Token is required.' };
    }
    if (!config.twilioPhoneNumber || !E164_REGEX.test(config.twilioPhoneNumber)) {
      return { success: false, error: 'Phone number must be a valid US E.164 number (e.g. +14155551234).' };
    }
  } else {
    if (!config.areaCode || !AREA_CODE_REGEX.test(config.areaCode)) {
      return { success: false, error: 'Area code must be exactly 3 digits.' };
    }
  }

  if (!config.brokerageName.trim()) return { success: false, error: 'Brokerage name is required.' };
  if (!config.primaryMarket.trim()) return { success: false, error: 'Primary market is required.' };
  if (!config.greetingText.trim()) return { success: false, error: 'Greeting text is required.' };

  const agentName = `${config.brokerageName} – ${config.primaryMarket} Agent`;
  const systemPrompt = buildSystemPrompt(config);

  try {
    // Step 1: Create a Retell LLM with our custom prompt
    const llm = await retell.llm.create({
      general_prompt: systemPrompt,
      begin_message: config.greetingText
    });

    // Step 2: Create the Retell agent bound to that LLM
    const agent = await retell.agent.create({
      agent_name: agentName,
      voice_id: 'retell-Cimo', // professional US English voice
      response_engine: { type: 'retell-llm', llm_id: llm.llm_id }
    });

    // Step 3: Provision or import the phone number and bind the agent
    let phoneNumber: string;

    if (config.telephonyType === 'RETELL_MANAGED') {
      const numResponse = await retell.phoneNumber.create({
        area_code: parseInt(config.areaCode!, 10),
        inbound_agents: [{ agent_id: agent.agent_id, weight: 1 }]
      });
      phoneNumber = numResponse.phone_number;
    } else {
      // Twilio SIP trunking: termination URI is your Twilio elastic SIP trunk domain
      // Format: <account-sid>.pstn.twilio.com
      const terminationUri = `${config.twilioAccountSid}.pstn.twilio.com`;
      const numResponse = await retell.phoneNumber.import({
        phone_number: config.twilioPhoneNumber!,
        termination_uri: terminationUri,
        nickname: config.twilioFriendlyName || agentName,
        sip_trunk_auth_username: config.twilioAccountSid,
        sip_trunk_auth_password: config.twilioAuthToken,
        inbound_agents: [{ agent_id: agent.agent_id, weight: 1 }]
      });
      phoneNumber = numResponse.phone_number;
    }

    // Step 4: Persist the mapping in our database
    await db.retellAgent.create({
      data: {
        spaceId: space.id,
        retellAgentId: agent.agent_id,
        retellLlmId: llm.llm_id,
        phoneNumber,
        telephonyType: config.telephonyType,
        status: 'ACTIVE',
        greetingText: config.greetingText,
        brokerageName: config.brokerageName,
        primaryMarket: config.primaryMarket
      }
    });

    return { success: true, phoneNumber, agentId: agent.agent_id };
  } catch (err: unknown) {
    console.error('[createAgentAction]', err);

    // Surface Retell SDK errors clearly
    if (err && typeof err === 'object' && 'status' in err) {
      const apiErr = err as { status: number; message?: string };
      if (apiErr.status === 429) {
        return { success: false, error: 'Retell API rate limit reached. Please wait a moment and try again.' };
      }
      if (apiErr.status === 401 || apiErr.status === 403) {
        return { success: false, error: 'Retell API key is invalid or unauthorised.' };
      }
      if (apiErr.status === 400) {
        return {
          success: false,
          error: `Retell API error: ${apiErr.message ?? 'Bad request. Check your inputs and try again.'}`
        };
      }
    }

    return { success: false, error: 'Unexpected error. Please try again or contact support.' };
  }
}
