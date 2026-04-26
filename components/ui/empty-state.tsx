import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const iconSize = size === 'sm' ? 20 : size === 'lg' ? 40 : 28;
  const minHeight = size === 'sm' ? 'min-h-[160px]' : size === 'lg' ? 'min-h-[400px]' : 'min-h-[240px]';

  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-10', minHeight, className)}>
      {Icon && (
        <div className="mb-4 flex items-center justify-center w-12 h-12 rounded-xl bg-muted">
          <Icon size={iconSize} className="text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-4">{description}</p>
      )}
      {action && (
        action.href ? (
          <a href={action.href}>
            <Button variant="outline" size="sm">{action.label}</Button>
          </a>
        ) : (
          <Button variant="outline" size="sm" onClick={action.onClick}>{action.label}</Button>
        )
      )}
    </div>
  );
}
