'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Lightbulb,
  RefreshCw,
  Loader2,
  X,
  ArrowUp,
  Trash2,
  Pencil,
  Plus,
  BarChart3,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Database,
  HelpCircle,
} from 'lucide-react';

// ── Types (mirror server types) ──────────────────────────────────────────────

interface FormSuggestion {
  type: 'reorder' | 'remove' | 'modify' | 'add' | 'scoring';
  target: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  reasoning: string;
  source?: 'data' | 'ai';
}

interface ScoreDistribution {
  hot: number;
  warm: number;
  cold: number;
}

interface FormPerformance {
  totalSubmissions: number;
  avgLeadScore: number;
  scoreDistribution: ScoreDistribution;
  mostCommonDropOff: string | null;
}

interface OptimizationResult {
  performance: FormPerformance;
  suggestions: FormSuggestion[];
  generatedAt: string;
  message?: string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

const IMPACT_STYLES: Record<string, { className: string; label: string }> = {
  high: { className: 'bg-red-100 text-red-700 border-red-200', label: 'High Impact' },
  medium: { className: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Medium Impact' },
  low: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Low Impact' },
};

/** Human-readable labels for suggestion types (no raw enum values in the UI) */
const TYPE_LABELS: Record<string, string> = {
  reorder: 'Reorder Fields',
  remove: 'Remove Field',
  modify: 'Edit Field',
  add: 'Add Field',
  scoring: 'Adjust Scoring',
};

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  reorder: ArrowUp,
  remove: Trash2,
  modify: Pencil,
  add: Plus,
  scoring: BarChart3,
};

/** Loading messages that rotate during AI analysis to reassure the user */
const LOADING_STEPS = [
  'Gathering your submission data...',
  'Analyzing answer patterns across questions...',
  'Identifying drop-off points...',
  'Generating personalized suggestions...',
];

function SuggestionCard({
  suggestion,
  onDismiss,
}: {
  suggestion: FormSuggestion;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[suggestion.type] ?? Lightbulb;
  const impact = IMPACT_STYLES[suggestion.impact] ?? IMPACT_STYLES.low;
  const isAI = suggestion.source === 'ai';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-md bg-muted flex items-center justify-center">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-semibold ${impact.className}`}
            >
              {impact.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {TYPE_LABELS[suggestion.type] ?? suggestion.type}
            </Badge>
            {isAI ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-violet-600 border-violet-200 bg-violet-50">
                <Sparkles size={9} /> AI Suggestion
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-slate-600 border-slate-200 bg-slate-50">
                <Database size={9} /> Based on Your Data
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium leading-snug">{suggestion.title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{suggestion.description}</p>

          {/* Reasoning shown by default so users always see WHY */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 mt-2 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide details' : 'Why this suggestion?'}
          </button>
          {expanded && (
            <p className="text-[11px] text-muted-foreground mt-1 pl-4 border-l-2 border-border leading-relaxed">
              {suggestion.reasoning}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Dismiss this suggestion"
          title="Dismiss suggestion"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function PerformanceSummary({ performance }: { performance: FormPerformance }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Submissions</p>
          <p className="text-lg font-bold mt-0.5">{performance.totalSubmissions}</p>
          <p className="text-[10px] text-muted-foreground">last 30 days</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Lead Score</p>
          <p className="text-lg font-bold mt-0.5">{performance.avgLeadScore}/100</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lead Quality</p>
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-emerald-500" />
              <span className="text-xs font-medium">{performance.scoreDistribution.hot}% Hot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-xs font-medium">{performance.scoreDistribution.warm}% Warm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown size={12} className="text-blue-400" />
              <span className="text-xs font-medium">{performance.scoreDistribution.cold}% Cold</span>
            </div>
          </div>
        </div>
        {performance.mostCommonDropOff && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Common Drop-off</p>
            <p className="text-xs font-medium mt-1 truncate" title={performance.mostCommonDropOff}>
              {performance.mostCommonDropOff}
            </p>
            <p className="text-[10px] text-muted-foreground">where applicants stop</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyzingProgress() {
  const [step, setStep] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 2200);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <Loader2 size={24} className="mx-auto animate-spin text-primary mb-3" />
      <p className="text-sm font-medium">Analyzing your form...</p>
      <p className="text-xs text-muted-foreground mt-2 h-4 transition-opacity duration-300">
        {LOADING_STEPS[step]}
      </p>
      <div className="flex justify-center gap-1.5 mt-4">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-500 ${
              i <= step ? 'w-6 bg-primary' : 'w-3 bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface OptimizationPanelProps {
  slug: string;
}

/** Maps raw API error text to friendly, actionable messages for realtors */
function friendlyErrorMessage(raw: string): { title: string; detail: string } {
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit')) {
    return {
      title: 'You have reached the analysis limit',
      detail: 'You can refresh suggestions up to 5 times per hour. Please wait a bit and try again.',
    };
  }
  if (lower.includes('openai') || lower.includes('ai') || lower.includes('timeout')) {
    return {
      title: 'Our AI assistant is temporarily unavailable',
      detail: 'The analysis service is experiencing high demand. Your data-driven suggestions will still appear. Try again in a minute.',
    };
  }
  if (lower.includes('no custom form')) {
    return {
      title: 'No form set up yet',
      detail: 'Switch to the Builder tab to create your intake form before running an analysis.',
    };
  }
  return {
    title: 'Something went wrong',
    detail: raw,
  };
}

export function OptimizationPanel({ slug }: OptimizationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSuggestions = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/form-config/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, skipCache }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data: OptimizationResult = await res.json();
      setResult(data);
      setDismissedIds(new Set());
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const handleDismiss = useCallback((target: string, type: string) => {
    setDismissedIds((prev) => new Set(prev).add(`${type}:${target}`));
  }, []);

  const visibleSuggestions = result?.suggestions.filter(
    (s) => !dismissedIds.has(`${s.type}:${s.target}`)
  ) ?? [];

  // Initial state: show analyze button with clear explanation
  if (!hasLoaded && !loading && !error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
          <Lightbulb size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="text-sm font-semibold mb-1">Get Suggestions to Improve Your Form</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto leading-relaxed">
            We will review how applicants interact with your form -- which questions they skip,
            where they drop off, and how their answers affect lead scores -- then recommend
            specific changes to get better results.
          </p>
          <Button onClick={() => fetchSuggestions()} disabled={loading}>
            <Lightbulb size={14} className="mr-1.5" /> Analyze My Form
          </Button>
          <p className="text-[10px] text-muted-foreground mt-3">
            Works best with at least 10 submissions in the last 30 days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Suggestions for Your Form</h3>
          {result?.generatedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Last analyzed {new Date(result.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSuggestions(true)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          <span className="ml-1.5">Re-analyze</span>
        </Button>
      </div>

      {/* Loading -- stepped progress instead of a bare spinner */}
      {loading && <AnalyzingProgress />}

      {/* Error -- friendly, structured, with recovery action */}
      {error && !loading && (() => {
        const { title, detail } = friendlyErrorMessage(error);
        return (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">{title}</p>
              <p className="text-xs text-red-600/80 mt-0.5">{detail}</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 mt-2 h-auto p-0 text-xs"
                onClick={() => fetchSuggestions()}
              >
                Try again
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Performance summary */}
          <PerformanceSummary performance={result.performance} />

          {/* Message (e.g., not enough data) -- with guidance */}
          {result.message && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
              <HelpCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-amber-700 font-medium">{result.message}</p>
                <p className="text-[11px] text-amber-600/80 mt-1">
                  Share your form link with more applicants to collect enough data. Once you reach the threshold, come back here for personalized recommendations.
                </p>
              </div>
            </div>
          )}

          {/* Suggestions list */}
          {visibleSuggestions.length > 0 ? (
            <div className="space-y-3">
              {visibleSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={`${suggestion.type}:${suggestion.target}`}
                  suggestion={suggestion}
                  onDismiss={() => handleDismiss(suggestion.target, suggestion.type)}
                />
              ))}
            </div>
          ) : result.suggestions.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                All suggestions dismissed. Click <strong>Re-analyze</strong> to get fresh recommendations.
              </p>
            </div>
          ) : !result.message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
              <p className="text-sm font-medium text-emerald-700">
                Your form looks great! No changes needed right now.
              </p>
              <p className="text-xs text-emerald-600/70 mt-1">
                Check back after you get more submissions for new insights.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
