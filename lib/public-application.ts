import { z } from 'zod';
import { normalizeSlug } from '@/lib/intake';

export const publicApplicationSchema = z.object({
  slug: z
    .string()
    .min(1)
    .transform((value) => normalizeSlug(value))
    .refine((value) => value.length >= 3, { message: 'Invalid slug' }),
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z
    .string()
    .trim()
    .email('Invalid email')
    .max(255)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
  phone: z.string().trim().min(1, 'Phone is required').max(40),
  budget: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null || value === '') return undefined;
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }),
  timeline: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
  preferredAreas: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
});

export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>;

export function normalizePhone(input: string) {
  return input.replace(/\D/g, '');
}

export function applicationFingerprintKey(input: Pick<PublicApplicationInput, 'slug' | 'name' | 'phone'>) {
  const normalizedName = input.name.trim().toLowerCase();
  const normalizedPhone = normalizePhone(input.phone);
  return `${input.slug}:${normalizedName}:${normalizedPhone}`;
}
