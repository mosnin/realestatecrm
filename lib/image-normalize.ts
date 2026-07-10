/**
 * Browser-side image normalization — the fix for "my photo won't upload."
 *
 * The real ceiling on uploads isn't our app's size cap; it's the hosting
 * platform, which rejects request bodies over ~4.5 MB BEFORE our route ever
 * runs (so no friendly error — just an opaque failure). A modern phone photo,
 * even re-saved as JPEG, routinely blows past that. The only reliable fix is to
 * shrink the image in the browser before it's ever sent.
 *
 * So: decode the picked file, downscale to a sane max edge, and re-encode as
 * JPEG. A 6 MB iPhone shot becomes ~300–600 KB — indistinguishable on a listing
 * card or detail hero, and comfortably under every limit. EXIF orientation is
 * honored during decode so portrait photos don't upload sideways.
 *
 * HEIC is the exception: browsers can't decode it in a canvas. We can't shrink
 * what we can't decode, so a HEIC file is returned untouched and the server
 * transcodes it (see /api/upload + lib/storage/image-format). HEIC files are
 * usually small enough to reach the server on their own.
 *
 * Best-effort by contract: any decode/encode failure returns the ORIGINAL file
 * unchanged, so a browser without the APIs (or a weird file) still uploads —
 * it just doesn't get the shrink. Never throws.
 */

export interface NormalizeOptions {
  /** Longest-edge cap in px. Listing photos never need more. */
  maxEdge?: number;
  /** JPEG quality, 0..1. */
  quality?: number;
}

const DEFAULTS: Required<NormalizeOptions> = { maxEdge: 2560, quality: 0.82 };

/** Formats the browser can't decode in a canvas — leave them for the server. */
function isCanvasUndecodable(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
}

/** Swap any extension for .jpg. */
function toJpgName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base || 'photo'}.jpg`;
}

export async function normalizeImageForUpload(file: File, opts: NormalizeOptions = {}): Promise<File> {
  const { maxEdge, quality } = { ...DEFAULTS, ...opts };

  // Can't decode HEIC/HEIF client-side — hand the original to the server.
  if (isCanvasUndecodable(file)) return file;
  // Only images; anything else is out of scope here.
  if (file.type && !file.type.startsWith('image/')) return file;
  // The APIs we need. If they're missing, upload the original untouched.
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  try {
    // `imageOrientation: 'from-image'` bakes EXIF rotation into the bitmap so
    // portrait iPhone shots don't come out sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    if (!width || !height) {
      bitmap.close?.();
      return file;
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob || blob.size === 0) return file;

    // If re-encoding somehow produced a bigger file than the original (a small,
    // already-optimized JPEG), keep whichever is smaller — but only trust the
    // original when it was already a safely-small, canvas-decodable image.
    if (blob.size >= file.size && file.size <= maxSafeOriginalBytes) return file;

    return new File([blob], toJpgName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    // Decode/encode failed — upload the original; the server still guards it.
    return file;
  }
}

/** A file already under this is small enough that re-encoding isn't worth it
 *  if it would grow the file. Well under the platform body limit. */
const maxSafeOriginalBytes = 2 * 1024 * 1024;
