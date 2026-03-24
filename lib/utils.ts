import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function normalizeRootDomain(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/\.$/, '')
    .replace(/^www\./, '');

  return sanitized;
}

export const protocol =
  process.env.NODE_ENV === 'production' ? 'https' : 'http';

const configuredRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
const defaultRootDomain =
  process.env.NODE_ENV === 'production'
    ? 'my.usechippi.com'
    : 'localhost:3000';

if (!configuredRootDomain && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[chippi] NEXT_PUBLIC_ROOT_DOMAIN is not set. Intake URLs will use the default domain:',
    defaultRootDomain,
    '— set this env var to match your actual deployment domain.'
  );
}

export const rootDomain =
  normalizeRootDomain(configuredRootDomain || defaultRootDomain);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
