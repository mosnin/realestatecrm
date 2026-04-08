'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye } from 'lucide-react';
import type { IntakeFormConfig, FormSection, FormQuestion } from './types';
import { getQuestionTypeConfig } from './question-types';

// ── Preview question renderer ──

function PreviewQuestion({ question }: { question: FormQuestion }) {
  const typeConfig = getQuestionTypeConfig(question.type);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">
          {question.label}
          {question.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      </div>
      {question.description && (
        <p className="text-xs text-muted-foreground">{question.description}</p>
      )}

      {/* Render based on type */}
      {question.type === 'text' && (
        <Input placeholder={question.placeholder || ''} disabled className="bg-muted/20" />
      )}

      {question.type === 'textarea' && (
        <Textarea placeholder={question.placeholder || ''} disabled className="bg-muted/20 min-h-[80px]" />
      )}

      {question.type === 'email' && (
        <Input type="email" placeholder={question.placeholder || 'name@example.com'} disabled className="bg-muted/20" />
      )}

      {question.type === 'phone' && (
        <Input type="tel" placeholder={question.placeholder || '(555) 123-4567'} disabled className="bg-muted/20" />
      )}

      {question.type === 'number' && (
        <Input type="number" placeholder={question.placeholder || '0'} disabled className="bg-muted/20" />
      )}

      {question.type === 'date' && (
        <Input type="date" disabled className="bg-muted/20" />
      )}

      {question.type === 'select' && (
        <Select disabled>
          <SelectTrigger className="w-full bg-muted/20">
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent>
            {(question.options || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {question.type === 'multi_select' && (
        <div className="space-y-1.5">
          {(question.options || []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" disabled className="rounded border-border" />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {question.type === 'radio' && (
        <div className="space-y-1.5">
          {(question.options || []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="radio" name={question.id} disabled />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {question.type === 'checkbox' && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" disabled className="rounded border-border" />
          {question.label}
        </label>
      )}
    </div>
  );
}

// ── Helper: format condition for display ──

function formatCondition(condition: FormSection['visibleWhen'], allSections: FormSection[]): string {
  if (!condition) return '';
  const allQuestions = allSections.flatMap((s) => s.questions);
  const refQuestion = allQuestions.find((q) => q.id === condition.questionId);
  const questionLabel = refQuestion?.label || condition.questionId;
  const operatorLabel =
    condition.operator === 'equals' ? '=' :
    condition.operator === 'not_equals' ? '!=' :
    'contains';
  return `"${questionLabel}" ${operatorLabel} "${condition.value}"`;
}

// ── Preview section ──

function PreviewSection({ section, allSections }: { section: FormSection; allSections: FormSection[] }) {
  const isConditional = !!section.visibleWhen;

  return (
    <div className={cn('space-y-4', isConditional && 'opacity-50 relative')}>
      {isConditional && (
        <div className="flex items-center gap-1.5 text-xs text-blue-500 bg-blue-50 dark:bg-blue-950/30 rounded-md px-2.5 py-1.5 border border-blue-200 dark:border-blue-800">
          <Eye size={12} className="flex-shrink-0" />
          <span>Hidden when {formatCondition(section.visibleWhen, allSections)}</span>
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{section.title}</h3>
        {section.description && (
          <p className="text-sm text-muted-foreground">{section.description}</p>
        )}
      </div>
      <div className="space-y-4">
        {section.questions.map((question) => (
          <PreviewQuestion key={question.id} question={question} />
        ))}
      </div>
    </div>
  );
}

// ── Main preview component ──

export interface FormPreviewProps {
  config: IntakeFormConfig;
}

export function FormPreview({ config }: FormPreviewProps) {
  if (config.sections.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">No form content to preview. Add sections and questions to see a preview.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Form header */}
        <div className="px-6 py-5 border-b border-border bg-muted/10">
          <h2 className="text-lg font-semibold">
            {config.leadType === 'rental'
              ? 'Rental Application'
              : config.leadType === 'buyer'
                ? 'Buyer Inquiry'
                : 'Contact Form'}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Preview of how applicants will see your form
          </p>
        </div>

        {/* Sections */}
        <div className="px-6 py-5 space-y-8">
          {config.sections.map((section) => (
            <PreviewSection key={section.id} section={section} allSections={config.sections} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/10">
          <div className="flex justify-end">
            <div className="h-9 px-6 rounded-md bg-primary/30 text-primary-foreground/50 flex items-center text-sm font-medium">
              Submit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
