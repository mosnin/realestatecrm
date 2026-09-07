import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getPerson, listPeople, writePersonNote } from '@/lib/integrations/follow-up-boss';
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
describe('Native FUB follow-through transport', () => {
  it('fetches the exact provider identity and maps its primary address', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 12, name: 'Jordan', emails: [{ value: 'j@example.test', isPrimary: true }] }) });
    expect(await getPerson('key', '12')).toMatchObject({ id: '12', name: 'Jordan', email: 'j@example.test' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.followupboss.com/v1/people/12', expect.objectContaining({ redirect: 'error' }));
  });
  it('rejects injected paths and mismatched provider identities', async () => {
    await expect(getPerson('key', '../identity')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 99 }) });
    await expect(getPerson('key', '12')).rejects.toThrow();
  });
  it('sends plaintext activity and requires a note acknowledgement', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 31 }) });
    expect(await writePersonNote('key', '12', '<script>client text</script>')).toBe('31');
    const options = fetchMock.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({ personId: 12, isHtml: false });
    expect(options.method).toBe('POST');
  });
  it('never retries a timeout or accepts an empty successful response as a receipt', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(writePersonNote('key', '12', 'done')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await expect(writePersonNote('key', '12', 'done')).rejects.toThrow('unconfirmed');
  });
  it('supports later pages and escapes a search rather than creating extra parameters', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ people: [] }) });
    await listPeople('key', 50, { offset: 50, search: 'Jordan&limit=1000' });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('offset')).toBe('50');
    expect(url.searchParams.get('name')).toBe('Jordan&limit=1000');
    expect(url.searchParams.get('limit')).toBe('50');
  });
});
