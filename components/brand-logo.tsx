import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  alt?: string;
  tone?: 'auto' | 'light' | 'dark';
}

/** Text-only Chippi wordmark. The cookie is reserved for standalone app icons. */
export function BrandLogo({ className, alt = 'Chippi', tone = 'auto' }: BrandLogoProps) {
  return (
    <span className={cn('relative inline-flex shrink-0 items-center', className)}>
      <img src="/brand/chippi-wordmark.png" alt={alt} width={2055} height={765}
        loading="eager" decoding="async"
        className={cn('block h-full w-auto', tone === 'light' ? 'brightness-0 invert' : tone === 'auto' ? 'dark:brightness-0 dark:invert' : '')} />
    </span>
  );
}
