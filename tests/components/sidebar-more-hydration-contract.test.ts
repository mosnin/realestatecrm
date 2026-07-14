import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/dashboard/sidebar.tsx'),
  'utf8',
);

describe('realtor sidebar More hydration contract', () => {
  it('renders the same closed state on server and first client pass', () => {
    expect(source).toContain('const [moreOpen, setMoreOpen] = useState(false)');
    expect(source).toContain("window.localStorage.getItem(MORE_STORAGE_KEY) === '1'");
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*setMoreOpen\(true\)[\s\S]*\}, \[\]\)/);
    expect(source).not.toMatch(/useState<boolean>\(\(\) =>[\s\S]*localStorage/);
  });
});
