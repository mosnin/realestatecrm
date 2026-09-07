import 'server-only';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getTool } from '@/lib/ai-tools/registry';
import { executeTool } from '@/lib/ai-tools/execute';
import type { WorkforcePrincipal } from '@/integrations/cadre/packages/core/src/node/workforce-auth';

// Explicit tenant-safe queries; adding a registry tool does not automatically expose it to workers.
export const WORKFORCE_CRM_QUERIES = ['list_contacts', 'find_person', 'find_deal', 'find_tours', 'find_property', 'pipeline_summary', 'workspace_stats', 'find_stuck_deals', 'find_quiet_hot_persons', 'find_overdue_followups'] as const;
export async function queryWorkforceCrm(principal: WorkforcePrincipal, clerkId: string, input: { operation?: string; tool?: string; args?: unknown; spaceId?: string }, signal: AbortSignal) {
  if (input.operation === 'catalog') {
    return { tools: WORKFORCE_CRM_QUERIES.map(name => {
      const tool = getTool(name);
      if (!tool || tool.requiresApproval !== false || (tool.riskLevel ?? 'safe') !== 'safe') throw new Error('CRM query policy mismatch');
      return { name, description: tool.description, parameters: z.toJSONSchema(tool.parameters, { io: 'input' }) };
    }) };
  }
  if (input.operation === 'workspaces') {
    const query = supabase.from('Space').select('id, slug, name');
    const { data, error } = principal.kind === 'personal' ? await query.eq('id', principal.scopeId).eq('ownerId', principal.actorId) : await query.eq('brokerageId', principal.scopeId);
    if (error) throw new Error('CRM workspaces unavailable');
    return { workspaces: data ?? [] };
  }
  if (input.operation !== 'query' || !WORKFORCE_CRM_QUERIES.includes(input.tool as never)) throw new Error('Unsupported CRM query');
  const tool = getTool(input.tool!);
  if (!tool || tool.requiresApproval !== false || (tool.riskLevel ?? 'safe') !== 'safe') throw new Error('CRM query policy mismatch');
  const spaceId = principal.kind === 'personal' ? principal.scopeId : input.spaceId;
  if (!spaceId) throw new Error('Select a CRM workspace from workspaces first');
  const query = supabase.from('Space').select('id, slug, name, ownerId').eq('id', spaceId);
  const { data: space, error } = principal.kind === 'personal' ? await query.eq('ownerId', principal.actorId).maybeSingle() : await query.eq('brokerageId', principal.scopeId).maybeSingle();
  if (error || !space) throw new Error('CRM workspace access unavailable');
  return executeTool(tool.name, input.args ?? {}, { userId: clerkId, space, signal, backgroundRun: true });
}
