export type ChatSurface = 'realtor' | 'broker';

export interface ChatSurfaceEndpoints {
  taskEndpoint: string;
  conversationsEndpoint: string;
  messagesEndpoint: string;
  resumeEndpointBase: string;
  conversationItemBase: string;
  routeBase: string;
  conversationCreatePayload: Record<string, unknown>;
}

/**
 * Single source of truth for the Chippi chat surface routing matrix.
 *
 * Keeping these endpoints together prevents the easy-to-miss class of bugs
 * where the broker UI creates a BrokerConversation but later loads history or
 * mutates it through the realtor endpoints (or the inverse). The broker route
 * base is `/broker` because `app/broker/page.tsx` is the canonical broker
 * Chippi home today.
 */
export function chatSurfaceEndpoints(surface: ChatSurface, slug: string): ChatSurfaceEndpoints {
  if (surface === 'broker') {
    return {
      taskEndpoint: '/api/ai/broker-task',
      conversationsEndpoint: '/api/ai/broker-conversations',
      messagesEndpoint: '/api/ai/broker-messages',
      // Broker approvals should never fall through to the realtor resume route.
      // Until a broker-specific resume endpoint exists, this intentionally 404s.
      resumeEndpointBase: '/api/ai/broker-task/resume',
      conversationItemBase: '/api/ai/broker-conversations',
      routeBase: '/broker',
      // The broker API resolves brokerage scope from the Clerk session.
      conversationCreatePayload: {},
    };
  }

  return {
    taskEndpoint: '/api/ai/task',
    conversationsEndpoint: '/api/ai/conversations',
    messagesEndpoint: '/api/ai/messages',
    resumeEndpointBase: '/api/ai/task/resume',
    conversationItemBase: '/api/ai/conversations',
    routeBase: `/s/${slug}/chippi`,
    conversationCreatePayload: { slug },
  };
}
