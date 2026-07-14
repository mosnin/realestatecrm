/**
 * Durable in-app notifications (the "AppNotification" table).
 *
 * WHY: the dashboard bell (components/dashboard/notification-center.tsx →
 * GET /api/notifications) historically showed only notifications COMPUTED
 * live from CRM rows (new leads, upcoming tours, due follow-ups…). Background
 * agent outcomes — swarm runs finishing via /api/internal/notify, Instant
 * First Touch drafts, workflow sends/failures, work-session completions —
 * only ever left an ephemeral web push. Miss the push and the outcome was
 * invisible. `createAppNotification` is the single creator for the durable
 * in-app record that closes that loop: rows land in "AppNotification"
 * (migration 20260817000000_app_notification.sql), the /api/notifications GET
 * merges them into the same list the bell reads, and read/dismiss state rides
 * the existing NotificationState mechanism keyed by the row id.
 *
 * Contract:
 *   - NEVER throws (sync or async). A notification write must not be able to
 *     break the agent/workflow path that emits it. Returns true when the row
 *     was written, false otherwise.
 *   - NOT preference-gated. Push/email/SMS respect channel toggles; the
 *     in-app record is the durable audit trail and is always written (the
 *     realtor controls it via read/dismiss in the bell).
 *   - Tenant scoping: the caller-supplied `spaceId` is written verbatim and
 *     is the security boundary; callers must derive it from authenticated
 *     context. The optional `spacePath` slug lookup is `.eq('id', spaceId)`
 *     scoped for the same reason.
 *   - Honest UI: callers must only record things that actually happened —
 *     write AFTER the draft/run/send is persisted, never before.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Category of the durable record. Free text in the DB (no CHECK constraint)
 * so a new category doesn't need a migration; the union keeps TS callers
 * honest. The notification center renders title/description generically, so
 * every category displays without client changes.
 */
export type AppNotificationType =
  /** A background/swarm agent run finished (via /api/internal/notify). */
  | 'agent_run'
  /** Instant First Touch: an intro draft is ready to review. */
  | 'first_touch'
  /** A background work session completed. */
  | 'work_session'
  /** A workflow/automation outcome (notify_agent action, failed run). */
  | 'automation'
  /** The scheduled-message dispatcher drafted or auto-sent a message. */
  | 'agent_send';

export type AppNotificationPriority = 'high' | 'medium' | 'low';

/** Length caps, mirroring /api/internal/notify's push payload caps. */
export const APP_NOTIFICATION_MAX_TITLE = 200;
export const APP_NOTIFICATION_MAX_BODY = 500;
export const APP_NOTIFICATION_MAX_HREF = 500;

export interface CreateAppNotificationInput {
  /** Tenant boundary — must come from authenticated/trusted context. */
  spaceId: string;
  type: AppNotificationType;
  title: string;
  body?: string;
  /**
   * Deep-link target as a full in-app path (e.g. `/s/acme/chippi/inbox`).
   * Wins over `spacePath`. When both are absent the notification center
   * falls back to the space dashboard (`/s/<slug>`).
   */
  href?: string | null;
  /**
   * Deep-link target RELATIVE to the space (e.g. `/automations`), for callers
   * that hold a spaceId but no slug. Resolved here via a spaceId-scoped Space
   * lookup; if the lookup fails the record is still written without a href.
   */
  spacePath?: string | null;
  /** Defaults to 'medium'. 'high' bolds the bell badge. */
  priority?: AppNotificationPriority;
}

/**
 * Write one durable in-app notification row. Best-effort, never throws.
 * Returns true when the row landed.
 */
export async function createAppNotification(
  input: CreateAppNotificationInput,
): Promise<boolean> {
  try {
    const spaceId = typeof input.spaceId === 'string' ? input.spaceId.trim() : '';
    const title =
      typeof input.title === 'string'
        ? input.title.trim().slice(0, APP_NOTIFICATION_MAX_TITLE)
        : '';
    if (!spaceId || !title) {
      logger.warn('[notifications] dropping record without spaceId/title', {
        spaceId: input.spaceId,
        type: input.type,
      });
      return false;
    }

    const body =
      typeof input.body === 'string'
        ? input.body.trim().slice(0, APP_NOTIFICATION_MAX_BODY)
        : '';

    let href: string | null =
      typeof input.href === 'string' && input.href.trim().length > 0
        ? input.href.trim().slice(0, APP_NOTIFICATION_MAX_HREF)
        : null;

    if (!href && typeof input.spacePath === 'string') {
      // Resolve /s/<slug><spacePath>. Scoped .eq('id', spaceId) — the caller's
      // spaceId is the tenant boundary here too.
      const { data: space } = await supabase
        .from('Space')
        .select('slug')
        .eq('id', spaceId)
        .maybeSingle();
      const slug = (space as { slug?: string | null } | null)?.slug;
      if (slug) {
        href = `/s/${slug}${input.spacePath}`.slice(0, APP_NOTIFICATION_MAX_HREF);
      }
    }

    const priority: AppNotificationPriority =
      input.priority === 'high' || input.priority === 'low' ? input.priority : 'medium';

    const { error } = await supabase.from('AppNotification').insert({
      spaceId,
      type: input.type,
      title,
      body,
      href,
      priority,
    });
    if (error) {
      // Includes the migration-not-yet-applied case ("relation does not
      // exist") — the emitting path must keep working either way.
      logger.warn('[notifications] in-app record insert failed', {
        spaceId,
        type: input.type,
        error: error.message,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('[notifications] in-app record write threw', { type: input.type }, err);
    return false;
  }
}
