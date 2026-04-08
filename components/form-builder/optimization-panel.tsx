'use client';

import { useState, useCallback } from 'react';
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
} from 'lucide-react';

// ── Types (mirror server types) ──────────────────────────────────────────────

interface FormSuggestion {
  type: 'reorder' | 'remove' | 'modify' | 'add' | 'scoring';
  target: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  reasoning: string;
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

const IMPACT_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  reorder: ArrowUp,
  remove: Trash2,
  modify: Pencil,
  add: Plus,
  scoring: BarChart3,
};

function SuggestionCard({
  suggestion,
  onDismiss,
}: {
  suggestion: FormSuggestion;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[suggestion.type] ?? Lightbulb;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-md bg-muted flex items-center justify-center">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-semibold ${IMPACT_COLORS[suggestion.impact] ?? ''}`}
            >
              {suggestion.impact.toUpperCase()}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {suggestion.type}
            </Badge>
          </div>
          <p className="text-sm font-medium leading-snug">{suggestion.title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{suggestion.description}</p>

          {/* Expandable reasoning */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 mt-2 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide reasoning' : 'Show reasoning'}
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
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Score</p>
          <p className="text-lg font-bold mt-0.5">{performance.avgLeadScore}/100</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Distribution</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <TrendingUp size={12} className="text-emerald-500" />
              <span className="text-xs font-medium">{performance.scoreDistribution.hot}%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-xs font-medium">{performance.scoreDistribution.warm}%</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown size={12} className="text-blue-400" />
              <span className="text-xs font-medium">{performance.scoreDistribution.cold}%</span>
            </div>
          </div>
        </div>
        {performance.mostCommonDropOff && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Drop-off Point</p>
            <p className="text-xs font-medium mt-1 truncate" title={performance.mostCommonDropOff}>
              {performance.mostCommonDropOff}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface OptimizationPanelProps {
  slug: string;
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

  // Initial state: show analyze button
  if (!hasLoaded && !loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
          <Lightbulb size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="text-sm font-semibold mb-1">Form Optimization</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
            Analyze your submission data to get AI-powered suggestions for improving your intake form.
            Requires at least 10 submissions.
          </p>
          <Button onClick={() => fetchSuggestions()} disabled={loading}>
            {loading ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Analyzing...</>
            ) : (
              <><Lightbulb size={14} className="mr-1.5" /> Analyze Form</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Optimization Suggestions</h3>
          {result?.generatedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Generated {new Date(result.generatedAt).toLocaleString()}
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
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Loader2 size={24} className="mx-auto animate-spin text-primary mb-3" />
          <p className="text-sm font-medium">Analyzing form performance...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take a few seconds.</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 mt-1 h-auto p-0"
              onClick={() => fetchSuggestions()}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Performance summary */}
          <PerformanceSummary performance={result.performance} />

          {/* Message (e.g., not enough data) */}
          {result.message && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{result.message}</p>
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
                All suggestions dismissed. Click Refresh to re-analyze.
              </p>
            </div>
          ) : !result.message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
              <p className="text-sm font-medium text-emerald-700">
                Your form is performing well! No optimization suggestions at this time.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
