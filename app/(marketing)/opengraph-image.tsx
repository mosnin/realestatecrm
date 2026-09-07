/** Shared social artwork: only the Chippi text wordmark on white. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const alt = 'Chippi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const image = await readFile(join(process.cwd(), 'public/brand/chippi-social.png'));
  return new Response(new Uint8Array(image), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
  });
}
