/**
 * GET /api/agent/insights
 *
 * Returns the most recent high-importance agent memories across all entities
 * in the space, enriched with entity names for display in the dashboard widget.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Recent observations and facts with importance >= 0.3, sorted by recency
  const { data: memories, error } = await tenantTable(supabase, 'AgentMemory', { spaceId: space.id })
    .select('id, memoryType, content, importance, entityType, entityId, createdAt')
    .gte('importance', 0.3)
    .order('createdAt', { ascending: false })
    .limit(20);

  if (error) throw error;
  type InsightMemory = {
    id: string;
    memoryType: string;
    content: string;
    importance: number;
    entityType: string;
    entityId: string;
    createdAt: string;
  };
  const memoryRows = (memories ?? []) as InsightMemory[];
  if (!memoryRows.length) return NextResponse.json([]);

  // Collect IDs by entity type to batch-fetch names
  const contactIds = [...new Set(memoryRows.filter((m) => m.entityType === 'contact').map((m) => m.entityId))];
  const dealIds = [...new Set(memoryRows.filter((m) => m.entityType === 'deal').map((m) => m.entityId))];

  const [contactsResult, dealsResult] = await Promise.all([
    contactIds.length
      ? tenantTable(supabase, 'Contact', { spaceId: space.id }).select('id, name').in('id', contactIds)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? tenantTable(supabase, 'Deal', { spaceId: space.id }).select('id, title').in('id', dealIds)
      : Promise.resolve({ data: [] }),
  ]);

  const contactNames = new Map(((contactsResult.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  const dealNames = new Map(((dealsResult.data ?? []) as Array<{ id: string; title: string }>).map((d) => [d.id, d.title]));

  const insights = memoryRows.map((m) => ({
    id: m.id,
    memoryType: m.memoryType,
    content: m.content,
    importance: m.importance,
    entityType: m.entityType,
    entityId: m.entityId,
    entityName:
      m.entityType === 'contact' ? (contactNames.get(m.entityId) ?? null) :
      m.entityType === 'deal' ? (dealNames.get(m.entityId) ?? null) :
      null,
    createdAt: m.createdAt,
  }));

  // Keep top 8 by importance then recency (already sorted by recency, re-sort by importance)
  insights.sort((a, b) => b.importance - a.importance || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(insights.slice(0, 8));
}
