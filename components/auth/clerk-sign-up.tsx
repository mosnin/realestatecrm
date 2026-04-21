'use client';

import { SignUp } from '@clerk/nextjs';
import { useTheme } from '@/components/theme-provider';
import { clerkAuthAppearance } from './clerk-appearance';

export function ThemedSignUp(props: Omit<React.ComponentProps<typeof SignUp>, 'appearance'>) {
  const { theme } = useTheme();
  return <SignUp {...props} appearance={clerkAuthAppearance(theme === 'dark')} />;
}
