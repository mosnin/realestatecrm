'use client';

import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldProgressProps {
  collectedFields: Record<string, unknown>;
  leadType?: 'rental' | 'buyer' | null;
  accentColor?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  budget: 'Budget',
  timing: 'Timeline',
  location: 'Location',
  preApproval: 'Pre-approval',
  propertyType: 'Property type',
};

const FIELDS_BY_LEAD_TYPE: Record<'rental' | 'buyer' | 'unknown', string[]> = {
  rental: ['name', 'email', 'phone', 'budget', 'timing', 'location'],
  buyer: ['name', 'email', 'phone', 'budget', 'preApproval', 'propertyType'],
  unknown: ['name', 'email', 'phone'],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FieldProgress({ collectedFields, leadType }: FieldProgressProps) {
  const key = leadType === 'rental' ? 'rental' : leadType === 'buyer' ? 'buyer' : 'unknown';
  const fields = FIELDS_BY_LEAD_TYPE[key];

  const collectedCount = fields.filter((f) => !!collectedFields[f]).length;
  const totalCount = fields.length;

  // Only show when at least 1 collected and at least 1 still missing.
  if (collectedCount === 0 || collectedCount === totalCount) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/30"
    >
      {fields.map((field) => {
        const collected = !!collectedFields[field];
        return (
          <span
            key={field}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full',
              collected
                ? 'bg-emerald-500/[0.1] text-emerald-600 dark:text-emerald-400'
                : 'bg-foreground/[0.04] text-muted-foreground/50',
            )}
          >
            {collected && <Check size={9} />}
            {FIELD_LABELS[field]}
          </span>
        );
      })}
    </motion.div>
  );
}
