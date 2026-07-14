import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('app/broker/activity/page.tsx', 'utf8');
const client = readFileSync('app/broker/activity/activity-client.tsx', 'utf8');

describe('broker activity hydration contract', () => {
  it('shares the server clock with the first relative-time render', () => {
    expect(page).toContain('const renderedAt = Date.now()');
    expect(page).toContain('initialNow={renderedAt}');
    expect(page).toContain('initialTimeZone={initialTimeZone}');
    expect(client).toContain('const [relativeNow, setRelativeNow] = useState(initialNow)');
    expect(client).toContain('formatRelative(r.createdAt, relativeNow, initialTimeZone)');
    expect(client).toContain('timeZone,');
    expect(client).not.toContain('const diffSec = Math.round((then - Date.now()) / 1000)');
  });
});
