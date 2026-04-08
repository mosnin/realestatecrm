'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import type { FormQuestion } from '@/lib/types';

// ── Selection card (radio-style pill) — matches the existing form aesthetic ──
function SelectionCard({
  label,
  selected,
  onClick,
  accentColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3.5 rounded-xl border transition-all text-sm',
        selected
          ? 'border-2 shadow-sm font-medium'
          : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
      )}
      style={
        selected
          ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
          : undefined
      }
    >
      {label}
    </button>
  );
}

// ── Multi-select chip (checkbox-style card) ──
function MultiSelectChip({
  label,
  checked,
  onClick,
  accentColor,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-3 rounded-xl border transition-all text-sm text-left',
        checked
          ? 'border-2 shadow-sm font-medium'
          : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
      )}
      style={
        checked
          ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
          : undefined
      }
    >
      <div
        className={cn(
          'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all',
          checked ? 'border-0' : 'border-muted-foreground/40',
        )}
        style={checked ? { backgroundColor: accentColor } : undefined}
      >
        {checked && <CheckCircle2 size={12} className="text-white" />}
      </div>
      {label}
    </button>
  );
}

export interface QuestionRendererProps {
  question: FormQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  error?: string;
  accentColor?: string;
}

/**
 * Renders a single FormQuestion based on its type.
 * Reusable in both the public intake form and the form builder preview.
 */
export function QuestionRenderer({
  question,
  value,
  onChange,
  error,
  accentColor = '#ff964f',
}: QuestionRendererProps) {
  const generatedId = useId();
  const inputId = `q-${question.id}-${generatedId}`;
  const strValue = typeof value === 'string' ? value : '';
  const arrValue = Array.isArray(value) ? value : [];

  const hasError = !!error;
  const inputClass = cn('h-12 rounded-xl', hasError && 'border-destructive');

  switch (question.type) {
    // ── Text input ──
    case 'text':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <Input
            id={inputId}
            type="text"
            placeholder={question.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            minLength={question.validation?.minLength}
            maxLength={question.validation?.maxLength}
          />
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Textarea ──
    case 'textarea':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <Textarea
            id={inputId}
            placeholder={question.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className={cn('rounded-xl', hasError && 'border-destructive')}
            maxLength={question.validation?.maxLength}
          />
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Email ──
    case 'email':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <Input
            id={inputId}
            type="email"
            placeholder={question.placeholder || 'alex@email.com'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Phone ──
    case 'phone':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <Input
            id={inputId}
            type="tel"
            placeholder={question.placeholder || '(555) 123-4567'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Number ──
    case 'number':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <Input
            id={inputId}
            type="number"
            placeholder={question.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            min={question.validation?.min}
            max={question.validation?.max}
          />
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Select (selection cards — single choice) ──
    case 'select':
      return (
        <div className="space-y-1.5">
          <Label>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <div className="space-y-2.5">
            {(question.options ?? []).map((option) => (
              <SelectionCard
                key={option.value}
                label={option.label}
                selected={strValue === option.value}
                onClick={() => onChange(option.value)}
                accentColor={accentColor}
              />
            ))}
          </div>
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Multi-select (checkbox-style chips) ──
    case 'multi_select': {
      const selected = arrValue.length > 0 ? arrValue : strValue ? strValue.split(',').filter(Boolean) : [];
      const toggle = (val: string) => {
        const updated = selected.includes(val)
          ? selected.filter((v) => v !== val)
          : [...selected, val];
        onChange(updated);
      };
      return (
        <div className="space-y-1.5">
          <Label>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {(question.options ?? []).map((option) => (
              <MultiSelectChip
                key={option.value}
                label={option.label}
                checked={selected.includes(option.value)}
                onClick={() => toggle(option.value)}
                accentColor={accentColor}
              />
            ))}
          </div>
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    // ── Radio (selection cards — same visual as select) ──
    case 'radio':
      return (
        <div className="space-y-1.5">
          <Label>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <div className="space-y-2.5">
            {(question.options ?? []).map((option) => (
              <SelectionCard
                key={option.value}
                label={option.label}
                selected={strValue === option.value}
                onClick={() => onChange(option.value)}
                accentColor={accentColor}
              />
            ))}
          </div>
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    // ── Checkbox (single boolean toggle) ──
    case 'checkbox':
      return (
        <div className="space-y-1.5">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id={inputId}
              checked={strValue === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              className="mt-0.5 rounded border-border cursor-pointer"
            />
            <label htmlFor={inputId} className="text-sm text-foreground leading-snug cursor-pointer">
              {question.label}
              {question.required && <span className="text-destructive"> *</span>}
            </label>
          </div>
          {question.description && (
            <p className="text-xs text-muted-foreground ml-7">{question.description}</p>
          )}
          {hasError && <p className="text-xs text-destructive ml-7">{error}</p>}
        </div>
      );

    // ── Date ──
    case 'date':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {question.label}
            {question.required && <span className="text-destructive"> *</span>}
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground">{question.description}</p>
          )}
          <Input
            id={inputId}
            type="date"
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {hasError && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );

    default:
      return null;
  }
}

// ── Validation helper ────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()+\-]{7,}$/;

/**
 * Validate a single question's answer.
 * Returns an error message string or null if valid.
 */
export function validateQuestion(
  question: FormQuestion,
  value: string | string[] | undefined,
): string | null {
  const strVal = typeof value === 'string' ? value.trim() : '';
  const arrVal = Array.isArray(value) ? value.filter(Boolean) : [];
  const isEmpty =
    (typeof value === 'string' && strVal === '') ||
    (Array.isArray(value) && arrVal.length === 0) ||
    value === undefined;

  // Required check
  if (question.required && isEmpty) {
    if (question.type === 'checkbox') {
      if (strVal !== 'true') return `${question.label} is required`;
    } else {
      return `${question.label} is required`;
    }
  }

  // Skip further validation if empty and not required
  if (isEmpty) return null;

  // Type-specific validation
  if (question.type === 'email' && strVal && !EMAIL_REGEX.test(strVal)) {
    return 'Invalid email address';
  }

  if (question.type === 'phone' && strVal && !PHONE_REGEX.test(strVal)) {
    return 'Invalid phone number';
  }

  if (question.type === 'number' && strVal) {
    const num = Number(strVal);
    if (isNaN(num)) return 'Must be a number';
    if (question.validation?.min !== undefined && num < question.validation.min) {
      return `Must be at least ${question.validation.min}`;
    }
    if (question.validation?.max !== undefined && num > question.validation.max) {
      return `Must be at most ${question.validation.max}`;
    }
  }

  // Custom pattern
  if (question.validation?.pattern && strVal) {
    try {
      const regex = new RegExp(question.validation.pattern);
      if (!regex.test(strVal)) {
        return 'Invalid format';
      }
    } catch {
      // Invalid regex in config — skip
    }
  }

  // Min/max length
  if (question.validation?.minLength !== undefined && strVal.length < question.validation.minLength) {
    return `Must be at least ${question.validation.minLength} characters`;
  }
  if (question.validation?.maxLength !== undefined && strVal.length > question.validation.maxLength) {
    return `Must be at most ${question.validation.maxLength} characters`;
  }

  return null;
}
