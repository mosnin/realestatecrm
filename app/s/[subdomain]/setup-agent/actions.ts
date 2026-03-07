'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';
import {
  createVapiAssistant,
  buyTwilioNumber,
  importTwilioNumberToVapi,
} from '@/lib/vapi';
import type { AgentConfig } from '@/lib/types/vapi';

export async function createAgentAction(config: AgentConfig) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) throw new Error('User not found');

  const space = await getSpaceByOwnerId(user.id);
  if (!space) throw new Error('Space not found');

  // Check if agent already exists
  const existing = await db.vapiAgent.findUnique({
    where: { spaceId: space.id },
  });
  if (existing) {
    throw new Error(
      'Agent already exists for this space. Delete the existing agent first.'
    );
  }

  try {
    // 1. Create the Vapi assistant with lead qualification prompt
    const assistant = await createVapiAssistant({
      greeting: config.greeting,
      market: config.market,
      brokerageName: config.brokerageName,
      spaceId: space.id,
    });

    // 2. Buy a Twilio number via master account
    const twilioNumber = await buyTwilioNumber(config.areaCode || undefined);

    // 3. Import the Twilio number into Vapi and link to assistant
    const vapiPhone = await importTwilioNumberToVapi(
      twilioNumber.phoneNumber,
      assistant.id
    );

    // 4. Store in database
    const record = await db.vapiAgent.create({
      data: {
        spaceId: space.id,
        vapiAssistantId: assistant.id,
        vapiPhoneNumberId: vapiPhone.id,
        phoneNumber: twilioNumber.phoneNumber,
        twilioSid: twilioNumber.sid,
        greeting: config.greeting,
        market: config.market,
        brokerageName: config.brokerageName,
        status: 'ACTIVE',
      },
    });

    return {
      success: true,
      agentId: record.vapiAssistantId,
      phoneNumber: record.phoneNumber,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create agent';

    if (message.includes('rate limit') || message.includes('429')) {
      throw new Error(
        'Rate limited. Please try again in a minute.'
      );
    }
    if (
      message.includes('already in use') ||
      message.includes('duplicate')
    ) {
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

  return db.vapiAgent.findUnique({
    where: { spaceId: space.id },
  });
}
