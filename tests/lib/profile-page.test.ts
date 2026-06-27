/**
 * profile-page pure helpers back the public realtor page (/p/[slug]) and its
 * editor. parseYouTubeId must pull the 11-char id out of every common YouTube
 * URL shape and reject everything else; faviconUrl must survive a malformed
 * URL without throwing. Pin both — they take user-pasted strings.
 */

import { describe, it, expect } from 'vitest';
import {
  parseYouTubeId,
  youTubeThumbnail,
  faviconUrl,
} from '@/lib/profile-page';

const ID = 'dQw4w9WgXcQ'; // canonical 11-char id

describe('parseYouTubeId', () => {
  it('extracts the id from every common URL shape', () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/v/${ID}`)).toBe(ID);
  });

  it('handles extra query params around the id', () => {
    expect(parseYouTubeId(`https://youtube.com/watch?list=PL123&v=${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}?t=42`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&feature=share`)).toBe(ID);
  });

  it('returns null for non-YouTube or malformed input', () => {
    expect(parseYouTubeId('https://vimeo.com/123456')).toBeNull();
    expect(parseYouTubeId('https://youtu.be/tooShort')).toBeNull();
    expect(parseYouTubeId('not a url at all')).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId(null as unknown as string)).toBeNull();
  });
});

describe('youTubeThumbnail', () => {
  it('builds the always-present hqdefault thumbnail URL', () => {
    expect(youTubeThumbnail(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});

describe('faviconUrl', () => {
  it('derives a favicon URL from the host', () => {
    expect(faviconUrl('https://example.com/some/path')).toBe(
      'https://www.google.com/s2/favicons?sz=128&domain=example.com',
    );
    expect(faviconUrl('http://sub.example.co.uk')).toContain('domain=sub.example.co.uk');
  });

  it('returns null for an unparseable URL instead of throwing', () => {
    expect(faviconUrl('not-a-url')).toBeNull();
    expect(faviconUrl('')).toBeNull();
  });
});
