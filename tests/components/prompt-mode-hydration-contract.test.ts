import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('components/ui/chippi-prompt-box.tsx', 'utf8');

describe('Chippi prompt mode hydration contract', () => {
  it('restores the sticky mode after the deterministic Chat render', () => {
    expect(source).toContain(
      "const [chatMode, setChatMode] = useState<ChatMode>('chat')",
    );
    expect(source).toContain('setChatMode(readStoredChatMode(conversationId))');
    expect(source).not.toMatch(
      /useState<ChatMode>\(\(\) =>\s*readStoredChatMode/,
    );
  });
});
