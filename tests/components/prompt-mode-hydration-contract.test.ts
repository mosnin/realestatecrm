import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const promptSource = readFileSync('components/ui/chippi-prompt-box.tsx', 'utf8');
const workspaceSource = readFileSync('components/chippi/chippi-workspace.tsx', 'utf8');

describe('Chippi prompt mode hydration contract', () => {
  it('restores the sticky mode after the deterministic Chat render', () => {
    expect(workspaceSource).toContain(
      "const [chatMode, setChatMode] = useState<ChatMode>('chat')",
    );
    expect(workspaceSource).toContain('setChatMode(readStoredChatMode(activeConversationId))');
    expect(workspaceSource).not.toMatch(
      /useState<ChatMode>\(\(\) =>\s*readStoredChatMode/,
    );
    expect(promptSource).toContain("chatMode = 'chat'");
  });
});
