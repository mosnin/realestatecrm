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
    ? 'workflowrouting.com'
    : 'localhost:3000';

export const rootDomain =
  normalizeRootDomain(configuredRootDomain || defaultRootDomain);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
