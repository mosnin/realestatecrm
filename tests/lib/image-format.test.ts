/**
 * Magic-byte image sniffing — the gate that decides whether an uploaded file
 * is a real, supported image regardless of its declared Content-Type. The
 * tricky case is HEIC: it shares the `ftyp` box with MP4/MOV, so a video must
 * NOT be mistaken for a photo.
 */

import { describe, it, expect } from 'vitest';
import { sniffImageFormat, extensionFor, contentTypeFor } from '@/lib/storage/image-format';

/** Build a 16-byte header from an offset→bytes spec. */
function header(...parts: Array<[number, number[]]>): Uint8Array {
  const h = new Uint8Array(16);
  for (const [offset, bytes] of parts) bytes.forEach((b, i) => (h[offset + i] = b));
  return h;
}
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe('sniffImageFormat', () => {
  it('detects JPEG', () => {
    expect(sniffImageFormat(header([0, [0xff, 0xd8, 0xff, 0xe0]]))).toBe('jpeg');
  });
  it('detects PNG', () => {
    expect(sniffImageFormat(header([0, [0x89, 0x50, 0x4e, 0x47]]))).toBe('png');
  });
  it('detects GIF', () => {
    expect(sniffImageFormat(header([0, ascii('GIF89a')]))).toBe('gif');
  });
  it('detects WebP (RIFF....WEBP)', () => {
    expect(sniffImageFormat(header([0, ascii('RIFF')], [8, ascii('WEBP')]))).toBe('webp');
  });

  it('detects HEIC by ftyp + a HEIF brand', () => {
    // ....ftypheic  (size box + ftyp + brand)
    expect(sniffImageFormat(header([4, ascii('ftyp')], [8, ascii('heic')]))).toBe('heic');
    expect(sniffImageFormat(header([4, ascii('ftyp')], [8, ascii('mif1')]))).toBe('heic');
  });

  it('does NOT mistake an MP4/MOV (ftyp + video brand) for an image', () => {
    // ....ftypisom / ftypqt   — same ftyp box, non-HEIF brand → not an image.
    expect(sniffImageFormat(header([4, ascii('ftyp')], [8, ascii('isom')]))).toBeNull();
    expect(sniffImageFormat(header([4, ascii('ftyp')], [8, ascii('qt  ')]))).toBeNull();
  });

  it('rejects unknown / junk bytes', () => {
    expect(sniffImageFormat(header([0, [0x00, 0x01, 0x02, 0x03]]))).toBeNull();
    expect(sniffImageFormat(new Uint8Array(0))).toBeNull();
  });

  it('requires WEBP marker, not just RIFF (a WAV must not pass as an image)', () => {
    // RIFF....WAVE → audio, not WebP.
    expect(sniffImageFormat(header([0, ascii('RIFF')], [8, ascii('WAVE')]))).toBeNull();
  });
});

describe('extensionFor / contentTypeFor', () => {
  it('maps jpeg to jpg + image/jpeg', () => {
    expect(extensionFor('jpeg')).toBe('jpg');
    expect(contentTypeFor('jpeg')).toBe('image/jpeg');
  });
  it('passes other formats through', () => {
    expect(extensionFor('png')).toBe('png');
    expect(contentTypeFor('webp')).toBe('image/webp');
    expect(contentTypeFor('heic')).toBe('image/heic');
  });
});
