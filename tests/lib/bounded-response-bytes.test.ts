import { describe, expect, it } from 'vitest';
import { readBoundedResponseBytes } from '@/lib/chippi/bounded-response-bytes';

function chunked(...chunks: string[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Buffer.from(chunk));
      controller.close();
    },
  }));
}

describe('bounded private response reader', () => {
  it('rejects an announced body larger than the completed file before reading it', async () => {
    const response = new Response('small', { headers: { 'content-length': '101' } });
    await expect(readBoundedResponseBytes(response, { expectedBytes: 100, maxBytes: 100 })).rejects.toThrow('announced more bytes');
  });

  it('stops a chunked response at expected/max plus one instead of buffering the remainder', async () => {
    const response = chunked('1234', '56', 'this chunk must not be retained');
    await expect(readBoundedResponseBytes(response, { expectedBytes: 5, maxBytes: 10 })).rejects.toThrow('returned more bytes');
  });

  it('rejects a shorter chunked response whose bytes do not match the completed record', async () => {
    const response = chunked('1234');
    await expect(readBoundedResponseBytes(response, { expectedBytes: 5, maxBytes: 10 })).rejects.toThrow('did not match');
  });

  it('returns exact bytes and honors a pre-aborted signal', async () => {
    await expect(readBoundedResponseBytes(chunked('12', '345'), { expectedBytes: 5, maxBytes: 10 })).resolves.toEqual(Buffer.from('12345'));
    const controller = new AbortController();
    controller.abort();
    await expect(readBoundedResponseBytes(chunked('12345'), { expectedBytes: 5, maxBytes: 10, signal: controller.signal })).rejects.toThrow('cancelled');
  });
});
