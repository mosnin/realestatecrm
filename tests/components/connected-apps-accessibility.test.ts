import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('connected app action accessibility', () => {
  it('names repeated integration actions with the provider name', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/settings/connected-apps-section.tsx'),
      'utf8',
    );

    expect(source).toContain('aria-label={`Connect ${appName}`}');
    expect(source).toContain('aria-label={`Disconnect ${appName}`}');
    expect(source).toContain('aria-label={`Reconnect ${appName}`}');
    expect(source).toContain('aria-label={`Updating ${appName} connection`}');
    expect(source).toContain("${isPaused ? 'Turn on' : 'Pause'} ${app.name} trigger monitoring");
  });
});
