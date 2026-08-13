import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCOPES = ['app/api/ai', 'app/s/[slug]/chippi', 'app/broker', 'lib/chat'];

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const p = path.join(abs, entry);
    const rel = path.relative(ROOT, p);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out.sort();
}

function source(file: string) {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

const files = SCOPES.flatMap(walk);
const realtorSharedTableFiles = files.filter((file) => {
  const body = source(file);
  return body.includes(".from('Conversation')") || body.includes(".from('Message')");
});
const brokerTableFiles = files.filter((file) => {
  const body = source(file);
  return body.includes(".from('BrokerConversation')") || body.includes(".from('BrokerMessage')");
});

describe('chat data-boundary contract', () => {
  it('keeps every realtor shared-table route wired to a reserved-surface guard', () => {
    const missingGuard = realtorSharedTableFiles.filter((file) => {
      const body = source(file);
      return ![
        'getAuthorizedRealtorConversation',
        'isRealtorConversation',
        'isReservedConversationTitle',
        'RESERVED_TITLE_LIKE_PATTERNS',
      ].some((marker) => body.includes(marker));
    });

    expect(missingGuard).toEqual([]);
  });

  it('scopes every realtor Message read by spaceId', () => {
    const unscopedMessageReads = realtorSharedTableFiles.filter((file) => {
      const body = source(file);
      return body.includes(".from('Message')") && !body.includes(".eq('spaceId'");
    });

    expect(unscopedMessageReads).toEqual([]);
  });

  it('keeps every broker chat table route wired to brokerage authorization or brokerage scoping', () => {
    const missingBrokerScope = brokerTableFiles.filter((file) => {
      const body = source(file);
      return ![
        'getAuthorizedBrokerConversation',
        'resolveBrokerContext',
        'brokerageId',
      ].some((marker) => body.includes(marker));
    });

    expect(missingBrokerScope).toEqual([]);
  });

  it('scopes every BrokerMessage read chain by brokerageId', () => {
    const unscopedBrokerMessageReads = brokerTableFiles.flatMap((file) => {
      const body = source(file);
      const reads = body.match(/\.from\('BrokerMessage'\)[\s\S]*?;/g) ?? [];
      return reads
        .filter((read) => !read.includes(".eq('brokerageId'"))
        .map((read) => ({ file, read }));
    });

    expect(unscopedBrokerMessageReads).toEqual([]);
  });

  it('scopes broker conversation authorization lookups by brokerageId in the query', () => {
    const body = source('lib/chat/broker-conversation-auth.ts');
    expect(body).toContain(".from('BrokerConversation')");
    expect(body).toContain(".eq('id', conversationId)");
    expect(body).toContain(".eq('brokerageId', brokerCtx.brokerage.id)");
  });

  it('scopes realtor conversation authorization lookups to owned spaces in the query', () => {
    const body = source('lib/chat/realtor-conversation-auth.ts');
    expect(body).toContain(".from('Space')");
    expect(body).toContain(".eq('ownerId', dbUser.id)");
    expect(body).toContain(".from('Conversation')");
    expect(body).toContain(".eq('id', conversationId)");
    expect(body).toContain(".in('spaceId', ownedSpaces.map((space) => space.id))");
  });

  it('scopes task-time conversation reuse queries to the active surface scope', () => {
    const realtorTask = source('app/api/ai/task/route.ts');
    expect(realtorTask).toContain(".from('Conversation')");
    expect(realtorTask).toContain(".eq('id', conversationId)");
    expect(realtorTask).toContain(".eq('spaceId', spaceId)");

    const brokerTask = source('app/api/ai/broker-task/route.ts');
    expect(brokerTask).toContain(".from('BrokerConversation')");
    expect(brokerTask).toContain(".eq('id', conversationId)");
    expect(brokerTask).toContain(".eq('brokerageId', brokerageId)");
  });

  it('scopes server-rendered broker URL conversation hydration by brokerageId', () => {
    const body = source('app/broker/chippi/page.tsx');
    const urlHydrationRead = body.match(/\.from\('BrokerConversation'\)[\s\S]*?\.maybeSingle\(\)/)?.[0] ?? '';

    expect(urlHydrationRead).toContain(".eq('id', urlConversationId)");
    expect(urlHydrationRead).toContain(".eq('brokerageId', ctx.brokerage.id)");
  });

  it('refuses Modal agent calls when the internal agent secret is missing', () => {
    const realtorTask = source('app/api/ai/task/route.ts');
    expect(realtorTask).toContain("const agentInternalSecret = process.env.AGENT_INTERNAL_SECRET");
    expect(realtorTask).toContain("if (!agentInternalSecret)");
    expect(realtorTask).toContain('secret: agentInternalSecret');

    const brokerTask = source('app/api/ai/broker-task/route.ts');
    expect(brokerTask).toContain("if (route === 'agent' && !process.env.AGENT_INTERNAL_SECRET)");
    expect(brokerTask).toContain('const agentInternalSecret = process.env.AGENT_INTERNAL_SECRET as string');
    expect(brokerTask).toContain('secret: agentInternalSecret');
  });

  it('lets broker agent-routing degrade to direct snapshot when Modal availability is missing', () => {
    const brokerTask = source('app/api/ai/broker-task/route.ts');
    expect(brokerTask).toContain('let route = decideBrokerRoute(message)');
    expect(brokerTask).toContain('MODAL_CHAT_URL not set — falling back to direct broker snapshot');
    expect(brokerTask).toContain('no runtime space for agentic turn — falling back to direct broker snapshot');
    expect(brokerTask).toContain("route = 'direct'");
  });
});
