import { listTeamWork } from '@/lib/teams/work-items';
import { listSharedRecords, RECORD_KINDS } from '@/lib/teams/shared-records';
import 'server-only';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getTool } from '@/lib/ai-tools/registry';
import { executeTool } from '@/lib/ai-tools/execute';
import type { WorkforcePrincipal } from '@/integrations/cadre/packages/core/src/node/workforce-auth';

// Explicit tenant-safe queries; adding a registry tool does not automatically expose it to workers.
export const WORKFORCE_CRM_QUERIES = ['list_contacts', 'find_person', 'find_deal', 'find_tours', 'find_property', 'pipeline_summary', 'workspace_stats', 'find_stuck_deals', 'find_quiet_hot_persons', 'find_overdue_followups'] as const;
export async function queryWorkforceCrm(principal: WorkforcePrincipal, clerkId: string, input: { operation?: string; tool?: string; args?: unknown; spaceId?: string }, signal: AbortSignal) {
  if (principal.kind === 'team' && process.env.CHIPPI_TEAM_CRM_ENABLED === 'true') {
    const parameters = z.object({ kind: z.enum(RECORD_KINDS).optional(), offset: z.number().int().min(0).max(100000).optional() }).strict();
    const workParameters = z.object({ offset: z.number().int().min(0).max(100000).default(0), closed: z.boolean().default(false) }).strict();
    if (input.operation === 'catalog') return { tools: [{ name: 'list_shared_records', description: 'Read the fields of People, Deals, and Properties explicitly shared with this team. Follow nextOffset for more records. This does not expose private notes, messages, files, or linked records.', parameters: z.toJSONSchema(parameters, { io: 'input' }) }, {name: 'list_team_work', description: 'Read this team’s assigned work, owners, due dates, acknowledgment and completion status. Follow nextOffset for more work. Overdue work is not completed work.', parameters: z.toJSONSchema(workParameters, {io:'input'})}] };
    if (input.operation === 'workspaces') return { workspaces: [] };
    if (input.operation === 'query' && input.tool === 'list_team_work' && !input.spaceId) {
      const args = workParameters.parse(input.args ?? {});
      signal.throwIfAborted();
      const result = await listTeamWork(principal.scopeId, principal.actorId, args.offset, args.closed);
      signal.throwIfAborted();
      return result;
    }
    if (input.operation !== 'query' || input.tool !== 'list_shared_records' || input.spaceId) throw new Error('CRM records are not shared with this team');
    signal.throwIfAborted();
    const result = await listSharedRecords(principal.scopeId, principal.actorId, parameters.parse(input.args ?? {}));
    signal.throwIfAborted();
    return result;
  }
  if (principal.kind === 'team') {
    if (input.operation === 'catalog') return { tools: [] };
    if (input.operation === 'workspaces') return { workspaces: [] };
    throw new Error('CRM records are not shared with this team');
  }
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
