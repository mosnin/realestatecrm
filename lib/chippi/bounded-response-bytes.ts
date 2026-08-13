/** Read a private HTTP response without ever buffering beyond the exact
 * database-authorized source size. The fetch itself owns network abort; the
 * reader also stops promptly when the same signal is cancelled. */
export async function readBoundedResponseBytes(
  response: Response,
  input: { expectedBytes: number; maxBytes: number; signal?: AbortSignal },
): Promise<Buffer> {
  if (!Number.isInteger(input.expectedBytes) || input.expectedBytes < 1 || !Number.isInteger(input.maxBytes) || input.maxBytes < 1) {
    throw new Error('Invalid download size boundary.');
  }
  const ceiling = Math.min(input.expectedBytes, input.maxBytes);
  const announced = response.headers.get('content-length');
  if (announced !== null) {
    if (!/^\d+$/.test(announced)) throw new Error('The source announced an invalid size.');
    const announcedBytes = Number(announced);
    if (!Number.isSafeInteger(announcedBytes) || announcedBytes > ceiling) {
      throw new Error('The source announced more bytes than allowed.');
    }
  }
  if (!response.body) throw new Error('The source response has no body.');

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  const cancel = () => { void reader.cancel(input.signal?.reason).catch(() => undefined); };
  input.signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (input.signal?.aborted) throw new Error('The source download was cancelled.');
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > ceiling) {
        await reader.cancel().catch(() => undefined);
        throw new Error('The source returned more bytes than allowed.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    input.signal?.removeEventListener('abort', cancel);
  }
  if (total !== input.expectedBytes) throw new Error('The source size did not match its completed file record.');
  return Buffer.concat(chunks, total);
}
