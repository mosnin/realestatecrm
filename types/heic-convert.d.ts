/**
 * Ambient types for `heic-convert` (no bundled or DefinitelyTyped types).
 *
 * heic-convert decodes Apple HEIC/HEIF (the iPhone default photo format,
 * which browsers can't render in <img>) into a JPEG/PNG buffer using a pure
 * libheif WASM build — so it runs on serverless without a native binary.
 */
declare module 'heic-convert' {
  interface HeicConvertOptions {
    /** The HEIC/HEIF file bytes. */
    buffer: Buffer | Uint8Array | ArrayBuffer;
    /** Output format. */
    format: 'JPEG' | 'PNG';
    /** JPEG quality 0..1 (ignored for PNG). */
    quality?: number;
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export = convert;
}
