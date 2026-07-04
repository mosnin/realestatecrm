import { cn } from '@/lib/utils';

/**
 * ChippiLogoMark — the REAL Chippi logo (the chip mark), not a generic glyph.
 *
 * Renders /favicon.png, the 512×512 brand mark, so every "Chippi is doing this"
 * surface is unmistakably Chippi. Use this (never a lucide Bot) wherever Chippi
 * needs to sign its work.
 */
export function ChippiLogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/favicon.png"
      alt="Chippi"
      width={size}
      height={size}
      className={cn('rounded-lg', className)}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
