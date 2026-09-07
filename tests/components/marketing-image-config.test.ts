import { describe, expect, it } from 'vitest';
import * as twitter from '../../app/(marketing)/twitter-image';
import * as openGraph from '../../app/(marketing)/opengraph-image';
describe('social image route metadata', () => {
  it('serves matching formats and accessible descriptions', () => {
    expect(twitter.size).toEqual(openGraph.size);
    expect(twitter.contentType).toBe(openGraph.contentType);
    expect(twitter.alt).toBe(openGraph.alt);
    expect(twitter.runtime).toBe(openGraph.runtime);
  });
});
