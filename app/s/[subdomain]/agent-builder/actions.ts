'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';
import { compileFlow, validateFlow } from '@/lib/compile-flow';
import { updateVapiAssistant } from '@/lib/vapi';
import type { FlowNode, FlowEdge } from '@/lib/types/flow';

export async function loadFlow(spaceId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const flow = await db.agentFlow.findUnique({
    where: { spaceId },
  });

  return flow
    ? { nodes: flow.nodes as unknown as FlowNode[], edges: flow.edges as unknown as FlowEdge[], version: flow.version }
    : null;
}

export async function saveFlow(
  spaceId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // Verify ownership
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) throw new Error('User not found');

  const space = await getSpaceByOwnerId(user.id);
  if (!space || space.id !== spaceId) throw new Error('Unauthorized');

  const nodesJson = JSON.parse(JSON.stringify(nodes));
  const edgesJson = JSON.parse(JSON.stringify(edges));

  const flow = await db.agentFlow.upsert({
    where: { spaceId },
    create: {
      spaceId,
      nodes: nodesJson,
      edges: edgesJson,
    },
    update: {
      nodes: nodesJson,
      edges: edgesJson,
      version: { increment: 1 },
    },
  });

  return { success: true, version: flow.version };
}

export async function deployFlow(spaceId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) throw new Error('User not found');

  const space = await getSpaceByOwnerId(user.id);
  if (!space || space.id !== spaceId) throw new Error('Unauthorized');

  // Load saved flow
  const flow = await db.agentFlow.findUnique({ where: { spaceId } });
  if (!flow) throw new Error('No flow saved yet');

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];

  // Validate
  const errors = validateFlow(nodes, edges);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Get agent
  const agent = await db.vapiAgent.findUnique({ where: { spaceId } });
  if (!agent) {
    return { success: false, errors: ['No AI agent configured. Set up your agent first in AI Agent settings.'] };
  }

  // Compile flow to Vapi config
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const compiled = compileFlow(nodes, edges, baseUrl);

  // PATCH Vapi assistant
  await updateVapiAssistant(agent.vapiAssistantId, {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: compiled.systemPrompt }],
      ...(compiled.tools.length > 0 ? { tools: compiled.tools } : {}),
    },
    firstMessage: compiled.firstMessage,
  });

  return { success: true, errors: [] };
}
