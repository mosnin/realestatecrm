import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import Image, { size, contentType } from '../../app/(marketing)/opengraph-image';
import TwitterImage from '../../app/(marketing)/twitter-image';

describe('Chippi social image', () => {
  it('serves the same 1200 by 630 PNG artwork for Open Graph and Twitter', async () => {
    const asset = await readFile('public/brand/chippi-social.png');
    expect(asset.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(asset.readUInt32BE(16)).toBe(size.width);
    expect(asset.readUInt32BE(20)).toBe(size.height);
    for (const render of [Image, TwitterImage]) {
      const response = await render();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(contentType);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(asset);
    }
  });
});
