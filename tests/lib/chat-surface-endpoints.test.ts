import { describe, expect, it } from 'vitest';
import { chatSurfaceEndpoints } from '@/lib/chat/surface-endpoints';

describe('chatSurfaceEndpoints', () => {
  it('routes realtor chat through realtor-scoped endpoints and slug URL', () => {
    expect(chatSurfaceEndpoints('realtor', 'jane')).toEqual({
      taskEndpoint: '/api/ai/task',
      conversationsEndpoint: '/api/ai/conversations',
      messagesEndpoint: '/api/ai/messages',
      resumeEndpointBase: '/api/ai/task/resume',
      conversationItemBase: '/api/ai/conversations',
      routeBase: '/s/jane/chippi',
      conversationCreatePayload: { slug: 'jane' },
    });
  });

  it('routes broker chat through broker-scoped endpoints and canonical Chippi URL', () => {
    expect(chatSurfaceEndpoints('broker', 'ignored')).toEqual({
      taskEndpoint: '/api/ai/broker-task',
      conversationsEndpoint: '/api/ai/broker-conversations',
      messagesEndpoint: '/api/ai/broker-messages',
      resumeEndpointBase: '/api/ai/broker-task/resume',
      conversationItemBase: '/api/ai/broker-conversations',
      routeBase: '/broker/chippi',
      conversationCreatePayload: {},
    });
  });
});
