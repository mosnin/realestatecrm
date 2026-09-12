import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

interface ChippiAvatarProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  pulse?: boolean;
}
const heights = { xs: 'h-4', sm: 'h-5', md: 'h-6', lg: 'h-8' };

export function ChippiAvatar({ size = 'sm', className }: ChippiAvatarProps) {
  return <BrandLogo className={cn(heights[size], className)} />;
}

interface ChippiBadgeProps {
  label?: string;
  className?: string;
}

export function ChippiBadge({ label = 'Chippi', className }: ChippiBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 rounded-full px-1.5 py-0.5',
      className,
    )}>
      {label}
    </span>
  );
}
