/**
 * Connected-app meta-tools for a chat or specialist turn.
 *
 * Lives in its own module so the isolated specialist (`delegate-run.ts`) can
 * load the same two tools as the parent without importing `sdk-chat.ts`
 * (that file already imports `delegate_task` → `delegate-run`).
 */

import type { Tool as SdkTool } from '@openai/agents';
import { activeToolkits } from '@/lib/integrations/connections';
import { composioConfigured } from '@/lib/integrations/composio';
import { buildIntegrationSearchTools } from '@/lib/integrations/agent-search-tools';
import { logger } from '@/lib/logger';
import type { ToolContext } from './types';

export interface IntegrationLoadResult {
  tools: SdkTool[];
  /** Toolkits whose tools are attached THIS turn. */
  liveToolkits: string[];
  /** Toolkits the realtor has connected but whose tools could not be
   *  loaded this turn for a TRANSIENT reason (Composio down, server key
   *  missing). Auth-dead connections are excluded — those flip to
   *  'expired' and stop being "connected". The prompt tells the model to
   *  describe these as temporarily unavailable, NOT as disconnected. */
  unavailableToolkits: string[];
}

/**
 * Integration tools for a turn — two meta-tools (find + call) instead of
 * every connected action schema. Build-time cost is ~0; the action schema
 * is fetched only when the model calls find_integration_tool.
 */
export async function loadIntegrationMetaTools(
  ctx: ToolContext,
  options: { userMessage?: string } = {},
): Promise<IntegrationLoadResult> {
  let toolkits: string[];
  try {
    toolkits = (await activeToolkits({ spaceId: ctx.space.id, userId: ctx.userId })) ?? [];
  } catch (err) {
    logger.warn('[sdk-chat] activeToolkits lookup failed — no integration tools', {
      spaceId: ctx.space.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { tools: [], liveToolkits: [], unavailableToolkits: [] };
  }
  if (toolkits.length === 0) return { tools: [], liveToolkits: [], unavailableToolkits: [] };
  if (!composioConfigured()) {
    logger.error(
      '[sdk-chat] COMPOSIO_API_KEY not configured but this workspace has connected toolkits — integration tools unavailable until it is set',
      { spaceId: ctx.space.id, toolkits },
    );
    return { tools: [], liveToolkits: [], unavailableToolkits: toolkits };
  }
  return {
    tools: buildIntegrationSearchTools(ctx, toolkits, {
      // Only a fresh turn / specialist brief supplies the exact current
      // message. Resume and other callers omit it, which intentionally
      // creates no Work write grant.
      userMessage: options.userMessage,
    }),
    liveToolkits: toolkits,
    unavailableToolkits: [],
  };
}
