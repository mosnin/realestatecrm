'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared scaffolding used by every step type: centered heading, optional
 * subtitle, content slot, primary action button, and a "skip" affordance for
 * optional questions. Keeping one scaffold means visual consistency across
 * 10+ step renderings without repeating layout code.
 */
interface StepScaffoldProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  onPrimary?: () => void;
  onSkip?: () => void;
  error?: string | null;
}

export function StepScaffold({
  title,
  subtitle,
  children,
  primaryLabel = 'Next',
  primaryDisabled,
  primaryBusy,
  onPrimary,
  onSkip,
  error,
}: StepScaffoldProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 max-w-xl text-sm text-white/60 sm:text-base">{subtitle}</p>
      )}

      <div className="mt-8 w-full">{children}</div>

      {error && (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error}
        </p>
      )}

      {(onPrimary || onSkip) && (
        <div className="mt-6 flex items-center gap-2">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              Skip
            </button>
          )}
          {onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled || primaryBusy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 transition-all',
                'hover:-translate-y-px hover:shadow-[0_10px_30px_rgba(255,120,50,0.35)]',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none',
              )}
            >
              {primaryBusy ? <Loader2 size={14} className="animate-spin" /> : null}
              {primaryLabel}
              {!primaryBusy && <ArrowRight size={14} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Text step ──────────────────────────────────────────────────────────────

interface TextStepProps {
  title: string;
  subtitle?: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onSkip?: () => void;
  type?: 'text' | 'tel' | 'url' | 'email';
  maxLength?: number;
  autoFocus?: boolean;
  required?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Optional helper text under the input. */
  helper?: string;
}

export function TextStep({
  title,
  subtitle,
  label,
  placeholder,
  value,
  onChange,
  onNext,
  onSkip,
  type = 'text',
  maxLength = 200,
  autoFocus = true,
  required = true,
  busy,
  error,
  helper,
}: TextStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const disabled = required && !value.trim();

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div className="mx-auto max-w-md text-left">
        {label && (
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {label}
          </label>
        )}
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !disabled) {
              e.preventDefault();
              onNext();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-white/30 outline-none backdrop-blur transition-colors focus:border-white/30 focus:bg-white/[0.07]"
        />
        {helper && <p className="mt-2 text-xs text-white/50">{helper}</p>}
      </div>
    </StepScaffold>
  );
}

// ── Textarea step ──────────────────────────────────────────────────────────

interface TextareaStepProps extends Omit<TextStepProps, 'type'> {
  rows?: number;
}

export function TextareaStep({
  title,
  subtitle,
  label,
  placeholder,
  value,
  onChange,
  onNext,
  onSkip,
  maxLength = 1000,
  autoFocus = true,
  required = false,
  busy,
  error,
  rows = 4,
}: TextareaStepProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const disabled = required && !value.trim();
  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div className="mx-auto max-w-lg text-left">
        {label && (
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-white/30 outline-none backdrop-blur transition-colors focus:border-white/30 focus:bg-white/[0.07]"
        />
      </div>
    </StepScaffold>
  );
}

// ── Slug step (with live uniqueness check) ─────────────────────────────────

interface SlugStepProps {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  /** Called with the raw value; returns { available, error? }. */
  onCheck: (v: string) => Promise<{ available: boolean; error?: string }>;
  busy?: boolean;
  /** Prefix shown next to the input, e.g. "chippi.app/" */
  urlPrefix?: string;
}

export function SlugStep({
  title,
  subtitle,
  value,
  onChange,
  onNext,
  onCheck,
  busy,
  urlPrefix = 'chippi.app/',
}: SlugStepProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailable(null);
    setError(null);
    const trimmed = value.trim();
    if (trimmed.length < 3) return;
    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await onCheck(trimmed);
        setAvailable(result.available);
        if (!result.available) setError(result.error ?? 'That name is taken.');
      } finally {
        setChecking(false);
      }
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, onCheck]);

  const disabled = !value.trim() || value.trim().length < 3 || available !== true;

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      error={error && available === false ? error : null}
    >
      <div className="mx-auto max-w-md text-left">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
          Your intake link
        </label>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-white/30 focus-within:bg-white/[0.07] transition-colors">
          <span className="inline-flex items-center border-r border-white/10 bg-white/[0.03] px-3 text-sm text-white/50">
            {urlPrefix}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              const next = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
              onChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disabled) {
                e.preventDefault();
                onNext();
              }
            }}
            placeholder="your-name"
            maxLength={48}
            className="flex-1 bg-transparent px-3 py-3 text-base text-white placeholder:text-white/30 outline-none"
          />
          <span className="inline-flex w-9 items-center justify-center text-sm">
            {checking ? (
              <Loader2 size={14} className="animate-spin text-white/50" />
            ) : available === true ? (
              <Check size={14} className="text-emerald-400" />
            ) : null}
          </span>
        </div>
        <p className="mt-2 text-xs text-white/50">
          Lowercase letters, numbers, and dashes only. This is where leads will land.
        </p>
      </div>
    </StepScaffold>
  );
}

// ── Tiles step (grid of choices) ───────────────────────────────────────────

export interface TileOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  description?: string;
}

interface TilesStepProps<T extends string> {
  title: string;
  subtitle?: string;
  options: TileOption<T>[];
  value: T | null;
  onSelect: (v: T) => void;
  /** Columns at md+. Defaults to 4. Use 2 for longer labels. */
  columns?: 2 | 3 | 4;
  /** When set, selecting a tile advances the step automatically. */
  advanceOnSelect?: boolean;
  onNext?: () => void;
  onSkip?: () => void;
  busy?: boolean;
}

export function TilesStep<T extends string>({
  title,
  subtitle,
  options,
  value,
  onSelect,
  columns = 4,
  advanceOnSelect = true,
  onNext,
  onSkip,
  busy,
}: TilesStepProps<T>) {
  const gridCols = columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={advanceOnSelect ? undefined : onNext}
      primaryDisabled={!value}
      primaryBusy={busy}
      onSkip={onSkip}
    >
      <div className={cn('mx-auto grid max-w-4xl grid-cols-1 gap-3', gridCols)}>
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                if (advanceOnSelect && onNext) {
                  // Short delay so the visual selection registers before the exit animation.
                  setTimeout(() => onNext(), 140);
                }
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-6 text-center transition-colors backdrop-blur',
                selected
                  ? 'border-white/60 bg-white/15 text-white'
                  : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-white/30 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              {Icon && (
                <Icon
                  size={22}
                  className={cn('transition-colors', selected ? 'text-white' : 'text-white/70 group-hover:text-white')}
                />
              )}
              <span className="text-sm font-semibold">{opt.label}</span>
              {opt.description && (
                <span className="text-[11px] text-white/50">{opt.description}</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </StepScaffold>
  );
}

// ── Photo step (optional logo/avatar upload) ───────────────────────────────

interface PhotoStepProps {
  title: string;
  subtitle?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onNext: () => void;
  onSkip: () => void;
  /** Upload endpoint that returns { url }. */
  uploadUrl?: string;
  /** Form field name for the upload type. */
  uploadKind?: string;
  busy?: boolean;
}

export function PhotoStep({
  title,
  subtitle,
  value,
  onChange,
  onNext,
  onSkip,
  uploadUrl = '/api/upload/onboarding',
  uploadKind = 'logo',
  busy,
}: PhotoStepProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', uploadKind);
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Upload failed');
        return;
      }
      onChange(data.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
        <div
          onClick={() => fileRef.current?.click()}
          className={cn(
            'relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors',
            value
              ? 'border-white/30 bg-white/5'
              : 'border-white/20 bg-white/[0.04] hover:border-white/40 hover:bg-white/[0.06]',
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : uploading ? (
            <Loader2 size={22} className="animate-spin text-white/60" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-white/60">
              <span className="text-xs font-medium">Click to upload</span>
              <span className="text-[10px]">PNG · JPG · WebP</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-white/60 hover:text-white"
          >
            Remove
          </button>
        )}
      </div>
    </StepScaffold>
  );
}
