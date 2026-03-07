'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';
import {
  createRetellAgent,
  buyRetellPhoneNumber,
  importTwilioPhoneNumber,
} from '@/lib/retell';
import type { AgentConfig } from '@/lib/types/retell';

export async function createAgentAction(config: AgentConfig) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) throw new Error('User not found');

  const space = await getSpaceByOwnerId(user.id);
  if (!space) throw new Error('Space not found');

  // Check if agent already exists
  const existing = await db.retellAgent.findUnique({
    where: { spaceId: space.id },
  });
  if (existing) {
    throw new Error('Agent already exists for this space. Delete the existing agent first.');
  }

  try {
    // 1. Create the Retell agent with custom prompt
    const { agent } = await createRetellAgent({
      greeting: config.greeting,
      market: config.market,
      brokerageName: config.brokerageName,
      spaceId: space.id,
    });

    // 2. Set up phone number based on telephony type
    let phoneNumber: string;

    if (config.telephonyType === 'RETELL_MANAGED') {
      const phone = await buyRetellPhoneNumber(
        agent.agent_id,
        config.areaCode
      );
      phoneNumber = phone.phone_number;
    } else {
      // Twilio import
      if (
        !config.twilioAccountSid ||
        !config.twilioAuthToken ||
        !config.twilioPhoneNumber
      ) {
        throw new Error('Twilio credentials are required');
      }

      // Validate E.164 format
      if (!/^\+1\d{10}$/.test(config.twilioPhoneNumber)) {
        throw new Error('Phone number must be in E.164 format (e.g., +12125551234)');
      }

      const imported = await importTwilioPhoneNumber(
        agent.agent_id,
        config.twilioPhoneNumber,
        config.twilioAccountSid,
        config.twilioAuthToken
      );
      phoneNumber = imported.phone_number;
    }

    // 3. Store in database
    const record = await db.retellAgent.create({
      data: {
        spaceId: space.id,
        retellAgentId: agent.agent_id,
        phoneNumber,
        telephonyType: config.telephonyType,
        greeting: config.greeting,
        market: config.market,
        brokerageName: config.brokerageName,
        status: 'ACTIVE',
      },
    });

    return {
      success: true,
      agentId: record.retellAgentId,
      phoneNumber: record.phoneNumber,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create agent';

    // Check for common Retell API errors
    if (message.includes('rate limit')) {
      throw new Error('Rate limited by Retell API. Please try again in a minute.');
    }
    if (message.includes('already in use') || message.includes('duplicate')) {
      throw new Error('This phone number is already in use.');
    }

    throw new Error(message);
  }
}

export async function getAgentStatus() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return null;

  const space = await getSpaceByOwnerId(user.id);
  if (!space) return null;

  return db.retellAgent.findUnique({
    where: { spaceId: space.id },
  });
}
