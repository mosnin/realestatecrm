/**
 * Image format sniffing by magic bytes — the single place that decides what an
 * uploaded image actually is, independent of its (spoofable, or plain wrong)
 * declared Content-Type. iOS in particular mislabels files constantly, so we
 * trust the bytes, not the browser.
 *
 * Pure + dependency-free so it's exhaustively unit-testable. HEIC needs special
 * care: it's an ISO-BMFF container that shares the `ftyp` box at offset 4 with
 * MP4/MOV/M4A, so a naive "ftyp ⇒ heic" check would misfire — we additionally
 * require a HEIF brand at offset 8.
 */

export type SniffedImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic';

const HEIF_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis', // HEVC-coded HEIF (what iPhones write)
  'hevc', 'hevx', 'hevm', 'hevs',
  'mif1', 'msf1', 'mif1', // generic image / image-sequence brands
  'heif',
]);

function ascii(header: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const b = header[start + i];
    if (b === undefined) return s;
    s += String.fromCharCode(b);
  }
  return s;
}

function matches(header: Uint8Array, offset: number, bytes: number[]): boolean {
  if (header.length < offset + bytes.length) return false;
  return bytes.every((b, i) => header[offset + i] === b);
}

/**
 * Identify an image from its leading bytes. Returns null for anything we don't
 * recognize as a supported image (the caller rejects those). `header` should be
 * at least the first 16 bytes of the file.
 */
export function sniffImageFormat(header: Uint8Array): SniffedImageFormat | null {
  // JPEG: FF D8 FF
  if (matches(header, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  // PNG: 89 50 4E 47
  if (matches(header, 0, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  // GIF: "GIF8"
  if (matches(header, 0, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  // WebP: "RIFF"...."WEBP"
  if (matches(header, 0, [0x52, 0x49, 0x46, 0x46]) && matches(header, 8, [0x57, 0x45, 0x42, 0x50])) {
    return 'webp';
  }
  // HEIC/HEIF: ISO-BMFF "ftyp" box at offset 4 + a HEIF brand at offset 8.
  if (matches(header, 4, [0x66, 0x74, 0x79, 0x70]) && HEIF_BRANDS.has(ascii(header, 8, 4).toLowerCase())) {
    return 'heic';
  }
  return null;
}

/** Canonical file extension for a sniffed format. */
export function extensionFor(format: SniffedImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

/** Canonical Content-Type for a sniffed format. */
export function contentTypeFor(format: SniffedImageFormat): string {
  return format === 'jpeg' ? 'image/jpeg'
    : format === 'png' ? 'image/png'
    : format === 'webp' ? 'image/webp'
    : format === 'gif' ? 'image/gif'
    : 'image/heic';
}
