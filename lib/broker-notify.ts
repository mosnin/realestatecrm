/**
 * Helper to create broker notifications.
 * Non-blocking — failures are logged but never throw.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { after } from 'next/server';

export type BrokerNotificationType =
  | 'member_joined'
  | 'member_removed'
  | 'deal_won'
  | 'deal_created'
  | 'lead_hot'
  | 'review_requested';

export interface NotifyBrokerParams {
  brokerageId: string;
  type: BrokerNotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

async function persistBrokerNotification(params: NotifyBrokerParams): Promise<void> {
  const { brokerageId, type, title, body, metadata } = params;

  try {
    await tenantTable(supabase, 'BrokerNotification', { brokerageId }).insert({
      id: crypto.randomUUID(),
      brokerageId,
      type,
      title,
      body: body ?? null,
      metadata: metadata ?? null,
      read: false,
    });
  } catch (err) {
    logger.error('[broker-notify] failed to create notification', { type, brokerageId }, err);
  }
}

/**
 * Preserve awaited semantics while keeping voided route calls alive after the
 * response. The same in-flight promise is shared with after(), so the write is
 * never duplicated.
 */
export async function notifyBroker(params: NotifyBrokerParams): Promise<void> {
  const task = persistBrokerNotification(params);
  try {
    after(() => task);
  } catch {
    // Non-request workers and unit tests continue with best-effort execution.
  }
  await task;
}
