'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GripVertical,
  Plus,
  Trash2,
  Lock,
  ChevronDown,
  ChevronRight,
  X,
  Eye,
} from 'lucide-react';
import { QUESTION_TYPES, getQuestionTypeConfig } from './question-types';
import type { IntakeFormConfig, FormSection, FormQuestion } from './types';

// ── Helpers ──

function generateId() {
  return crypto.randomUUID();
}

function createQuestion(type: FormQuestion['type']): FormQuestion {
  const config = getQuestionTypeConfig(type);
  return {
    id: generateId(),
    type,
    label: config?.defaultConfig.label ?? 'New Question',
    placeholder: config?.defaultConfig.placeholder,
    required: config?.defaultConfig.required ?? false,
    position: 0,
    options: config?.defaultConfig.options ? [...config.defaultConfig.options] : undefined,
  };
}

function createSection(position: number): FormSection {
  return {
    id: generateId(),
    title: `Section ${position + 1}`,
    description: '',
    position,
    questions: [],
  };
}

// ── Draggable palette item ──

function PaletteItem({ type, label, icon: Icon, onClick }: { type: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { origin: 'palette', questionType: type },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card p-3 cursor-grab text-center hover:border-primary/40 hover:bg-accent/50 transition-colors active:cursor-grabbing',
        isDragging && 'ring-2 ring-primary/30',
      )}
    >
      <Icon size={18} className="text-muted-foreground" />
      <span className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</span>
      <GripVertical size={10} className="text-muted-foreground/30" />
    </div>
  );
}

// ── Sortable question row ──

function SortableQuestion({
  question,
  isSelected,
  onSelect,
}: {
  question: FormQuestion;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const typeConfig = getQuestionTypeConfig(question.type);
  const Icon = typeConfig?.icon;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
    data: { origin: 'question', question },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border bg-card hover:border-primary/30',
        question.system && 'bg-muted/40',
      )}
    >
      <button
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      {Icon && <Icon size={14} className="flex-shrink-0 text-muted-foreground" />}
      <span className="text-sm font-medium truncate flex-1">{question.label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {question.required && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>
        )}
        {question.system && (
          <Lock size={12} className="text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

// ── Sortable section ──

function SortableSection({
  section,
  selectedId,
  onSelectQuestion,
  onSelectSection,
  onAddQuestion,
  isSectionSelected,
  allSections,
}: {
  section: FormSection;
  selectedId: string | null;
  onSelectQuestion: (id: string) => void;
  onSelectSection: (id: string) => void;
  onAddQuestion: (sectionId: string) => void;
  isSectionSelected: boolean;
  allSections: FormSection[];
}) {
  const [collapsed, setCollapsed] = useState(false);

  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: { origin: 'section', section },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${section.id}`,
    data: { origin: 'section', sectionId: section.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={(node: HTMLDivElement | null) => {
        setSortableRef(node);
        setDroppableRef(node);
      }}
      style={style}
      className={cn(
        'rounded-xl border-2 overflow-hidden transition-colors',
        isOver
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : isSectionSelected
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-border',
      )}
    >
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border cursor-pointer"
        onClick={() => onSelectSection(section.id)}
      >
        <button
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>
        <button
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold truncate">{section.title}</p>
            {section.visibleWhen && (
              <Badge variant="outline" className="text-[10px] flex-shrink-0 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 gap-1">
                <Eye size={10} />
                Conditional
              </Badge>
            )}
          </div>
          {section.description && (
            <p className="text-xs text-muted-foreground truncate">{section.description}</p>
          )}
          {section.visibleWhen && (
            <p className="text-[10px] text-blue-500 truncate">
              Shown when &quot;{(() => {
                const allQs = allSections.flatMap((s) => s.questions);
                const refQ = allQs.find((q) => q.id === section.visibleWhen?.questionId);
                return refQ?.label || section.visibleWhen?.questionId;
              })()}&quot; {section.visibleWhen.operator === 'equals' ? 'is' : section.visibleWhen.operator === 'not_equals' ? 'is not' : 'contains'} &quot;{(() => {
                const allQs = allSections.flatMap((s) => s.questions);
                const refQ = allQs.find((q) => q.id === section.visibleWhen?.questionId);
                const refOpt = refQ?.options?.find((o) => o.value === section.visibleWhen?.value);
                return refOpt?.label || section.visibleWhen?.value;
              })()}&quot;
            </p>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] flex-shrink-0">
          {section.questions.length} {section.questions.length === 1 ? 'question' : 'questions'}
        </Badge>
      </div>

      {/* Questions */}
      {!collapsed && (
        <div className="p-3 space-y-2">
          <SortableContext
            items={section.questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            {section.questions.map((question) => (
              <SortableQuestion
                key={question.id}
                question={question}
                isSelected={selectedId === question.id}
                onSelect={() => onSelectQuestion(question.id)}
              />
            ))}
          </SortableContext>

          <button
            type="button"
            onClick={() => onAddQuestion(section.id)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors pt-1"
          >
            <Plus size={14} /> Add question
          </button>
        </div>
      )}
    </div>
  );
}

// ── Property editor (right panel) ──

function QuestionEditor({
  question,
  allQuestions,
  onChange,
  onDelete,
}: {
  question: FormQuestion;
  allQuestions: FormQuestion[];
  onChange: (updated: FormQuestion) => void;
  onDelete: () => void;
}) {
  const isSystem = !!question.system;
  const hasOptions = ['select', 'multi_select', 'radio'].includes(question.type);

  const updateField = <K extends keyof FormQuestion>(key: K, value: FormQuestion[K]) => {
    onChange({ ...question, [key]: value });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Edit Question</h3>
        {isSystem && (
          <Badge variant="secondary" className="text-[10px]">
            <Lock size={10} className="mr-1" /> System Field
          </Badge>
        )}
      </div>

      {/* Label */}
      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={question.label}
          onChange={(e) => updateField('label', e.target.value)}
          placeholder="Question label"
          disabled={isSystem}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea
          value={question.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Help text shown below the question"
          className="min-h-[60px]"
        />
      </div>

      {/* Placeholder */}
      <div className="space-y-1.5">
        <Label className="text-xs">Placeholder (optional)</Label>
        <Input
          value={question.placeholder || ''}
          onChange={(e) => updateField('placeholder', e.target.value)}
          placeholder="Placeholder text"
        />
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <Label className="text-xs">Type</Label>
        <Select
          value={question.type}
          onValueChange={(val) => updateField('type', val as FormQuestion['type'])}
          disabled={isSystem}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((qt) => (
              <SelectItem key={qt.type} value={qt.type}>
                {qt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Required toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Required</Label>
        <Switch
          checked={question.required}
          onCheckedChange={(checked) => updateField('required', checked)}
          disabled={isSystem}
        />
      </div>

      {/* Options editor for select/radio/multi_select */}
      {hasOptions && (
        <div className="space-y-2">
          <Label className="text-xs">Options</Label>
          {(question.options || []).map((opt, idx) => (
            <div key={idx} className="rounded-md border border-border/60 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  value={opt.label}
                  onChange={(e) => {
                    const newOpts = [...(question.options || [])];
                    newOpts[idx] = { ...newOpts[idx], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                    updateField('options', newOpts);
                  }}
                  placeholder="Option label"
                  className="flex-1 h-8 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newOpts = (question.options || []).filter((_, i) => i !== idx);
                    updateField('options', newOpts);
                  }}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={14} />
              </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] text-muted-foreground w-10 flex-shrink-0">Score</Label>
                <Input
                  type="number"
                  value={opt.scoreValue ?? ''}
                  onChange={(e) => {
                    const newOpts = [...(question.options || [])];
                    newOpts[idx] = { ...newOpts[idx], scoreValue: e.target.value ? Number(e.target.value) : undefined };
                    updateField('options', newOpts);
                  }}
                  placeholder="0"
                  className="flex-1 h-7 text-xs"
                  title="Score value for this option"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const newOpts = [...(question.options || []), { value: `option_${(question.options?.length || 0) + 1}`, label: `Option ${(question.options?.length || 0) + 1}` }];
              updateField('options', newOpts);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus size={12} /> Add option
          </button>
        </div>
      )}

      {/* Scoring weight */}
      <div className="space-y-1.5">
        <Label className="text-xs">Scoring Weight (0-10)</Label>
        <Input
          type="number"
          min={0}
          max={10}
          value={question.scoring?.weight ?? 0}
          onChange={(e) => {
            const weight = Math.min(10, Math.max(0, Number(e.target.value) || 0));
            updateField('scoring', { ...question.scoring, weight });
          }}
          className="w-24"
        />
      </div>

      {/* Conditional visibility */}
      <div className="space-y-2">
        <Label className="text-xs">Show or hide this question</Label>
        <p className="text-[11px] text-muted-foreground">Only show this question when another question has a specific answer.</p>

        <div className="space-y-2">
          <Select
            value={question.visibleWhen?.questionId || '__none__'}
            onValueChange={(val) => {
              if (val === '__none__') {
                updateField('visibleWhen', undefined);
                return;
              }
              updateField('visibleWhen', {
                questionId: val,
                operator: question.visibleWhen?.operator || 'equals',
                value: question.visibleWhen?.value || '',
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a question..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Always show</SelectItem>
              {allQuestions
                .filter((q) => q.id !== question.id)
                .map((q) => (
                  <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
                ))}
            </SelectContent>
          </Select>

          {question.visibleWhen?.questionId && (
            <>
              <Select
                value={question.visibleWhen.operator}
                onValueChange={(val) => {
                  updateField('visibleWhen', {
                    ...question.visibleWhen!,
                    operator: val as 'equals' | 'not_equals' | 'contains',
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">is exactly</SelectItem>
                  <SelectItem value="not_equals">is not</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                </SelectContent>
              </Select>
              {/* Show dropdown of available options when the referenced question has predefined choices */}
              {(() => {
                const refQuestion = allQuestions.find((q) => q.id === question.visibleWhen?.questionId);
                const hasRefOptions = refQuestion?.options && refQuestion.options.length > 0;
                if (hasRefOptions) {
                  return (
                    <Select
                      value={question.visibleWhen!.value || '__pick__'}
                      onValueChange={(val) => {
                        if (val === '__pick__') return;
                        updateField('visibleWhen', {
                          ...question.visibleWhen!,
                          value: val,
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick an answer..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__pick__" disabled>Pick an answer...</SelectItem>
                        {refQuestion!.options!.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }
                return (
                  <Input
                    value={question.visibleWhen!.value}
                    onChange={(e) => {
                      updateField('visibleWhen', {
                        ...question.visibleWhen!,
                        value: e.target.value,
                      });
                    }}
                    placeholder="Type the answer value..."
                  />
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Delete button */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        disabled={isSystem}
        className="w-full"
      >
        <Trash2 size={14} className="mr-1.5" />
        Delete Question
      </Button>
    </div>
  );
}

function SectionEditor({
  section,
  allQuestions,
  allSections,
  onChange,
  onDelete,
}: {
  section: FormSection;
  allQuestions: FormQuestion[];
  allSections: FormSection[];
  onChange: (updated: FormSection) => void;
  onDelete: () => void;
}) {
  const SYSTEM_FIELD_IDS = ['name', 'email', 'phone'];
  const hasSystemField = section.questions.some(
    (q) => q.system || SYSTEM_FIELD_IDS.includes(q.id),
  );
  const isFirstSection = allSections.length > 0 && allSections[0].id === section.id;
  const disableVisibility = hasSystemField || isFirstSection;

  // Gather questions from earlier sections
  const sectionIndex = allSections.findIndex((s) => s.id === section.id);
  const earlierQuestions = allSections
    .slice(0, Math.max(0, sectionIndex))
    .flatMap((s) => s.questions);

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold">Edit Section</h3>

      <div className="space-y-1.5">
        <Label className="text-xs">Title</Label>
        <Input
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          placeholder="Section title"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea
          value={section.description || ''}
          onChange={(e) => onChange({ ...section, description: e.target.value })}
          placeholder="Brief description of this section"
          className="min-h-[60px]"
        />
      </div>

      {/* Section Visibility */}
      <div className="space-y-2">
        <Label className="text-xs">Show or hide this step</Label>
        {disableVisibility ? (
          <p className="text-[11px] text-muted-foreground">
            {hasSystemField
              ? 'This section contains required contact fields and is always shown to applicants.'
              : 'The first step is always shown to applicants.'}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">Only show this step to applicants when they give a specific answer to an earlier question. For example, show rental-only questions when someone picks &quot;I&apos;m looking to rent.&quot;</p>

            <div className="space-y-2">
              <Select
                value={section.visibleWhen?.questionId || '__none__'}
                onValueChange={(val) => {
                  if (val === '__none__') {
                    onChange({ ...section, visibleWhen: undefined });
                    return;
                  }
                  onChange({
                    ...section,
                    visibleWhen: {
                      questionId: val,
                      operator: section.visibleWhen?.operator || 'equals',
                      value: section.visibleWhen?.value || '',
                    },
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a question..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Always show this step</SelectItem>
                  {earlierQuestions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {section.visibleWhen?.questionId && (
                <>
                  <Select
                    value={section.visibleWhen.operator}
                    onValueChange={(val) => {
                      onChange({
                        ...section,
                        visibleWhen: {
                          ...section.visibleWhen!,
                          operator: val as 'equals' | 'not_equals' | 'contains',
                        },
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">is exactly</SelectItem>
                      <SelectItem value="not_equals">is not</SelectItem>
                      <SelectItem value="contains">contains</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Show a dropdown of available options when the referenced question has predefined choices */}
                  {(() => {
                    const refQuestion = earlierQuestions.find((q) => q.id === section.visibleWhen?.questionId);
                    const hasRefOptions = refQuestion?.options && refQuestion.options.length > 0;
                    if (hasRefOptions) {
                      return (
                        <Select
                          value={section.visibleWhen!.value || '__pick__'}
                          onValueChange={(val) => {
                            if (val === '__pick__') return;
                            onChange({
                              ...section,
                              visibleWhen: {
                                ...section.visibleWhen!,
                                value: val,
                              },
                            });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pick an answer..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__pick__" disabled>Pick an answer...</SelectItem>
                            {refQuestion!.options!.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }
                    return (
                      <Input
                        value={section.visibleWhen!.value}
                        onChange={(e) => {
                          onChange({
                            ...section,
                            visibleWhen: {
                              ...section.visibleWhen!,
                              value: e.target.value,
                            },
                          });
                        }}
                        placeholder="Type the answer value..."
                      />
                    );
                  })()}
                </>
              )}

              {section.visibleWhen?.questionId && section.visibleWhen?.value && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300">
                    Applicants will see this step only when they answer &quot;{(() => {
                      const refQ = earlierQuestions.find((q) => q.id === section.visibleWhen?.questionId);
                      const refOpt = refQ?.options?.find((o) => o.value === section.visibleWhen?.value);
                      return refOpt?.label || section.visibleWhen?.value;
                    })()}&quot; to &quot;{earlierQuestions.find((q) => q.id === section.visibleWhen?.questionId)?.label || section.visibleWhen.questionId}&quot;.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        className="w-full"
      >
        <Trash2 size={14} className="mr-1.5" />
        Delete Section
      </Button>
    </div>
  );
}

// ── Main form builder ──

export interface FormBuilderProps {
  config: IntakeFormConfig;
  onChange: (config: IntakeFormConfig) => void;
}

export function FormBuilder({ config, onChange }: FormBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'question' | 'section'>('question');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Gather all questions flat (for conditional visibility dropdown)
  const allQuestions = config.sections.flatMap((s) => s.questions);

  // Find selected item
  const selectedQuestion = selectedType === 'question'
    ? allQuestions.find((q) => q.id === selectedId) ?? null
    : null;
  const selectedSection = selectedType === 'section'
    ? config.sections.find((s) => s.id === selectedId) ?? null
    : null;

  // ── Mutation helpers ──

  const updateSections = useCallback(
    (updater: (sections: FormSection[]) => FormSection[]) => {
      onChange({ ...config, sections: updater(config.sections) });
    },
    [config, onChange],
  );

  const handleAddSection = useCallback(() => {
    const newSection = createSection(config.sections.length);
    updateSections((sections) => [...sections, newSection]);
    setSelectedId(newSection.id);
    setSelectedType('section');
  }, [config.sections.length, updateSections]);

  const handleAddQuestion = useCallback(
    (sectionId: string) => {
      const newQ = createQuestion('text');
      updateSections((sections) =>
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          const questions = [...s.questions, { ...newQ, position: s.questions.length }];
          return { ...s, questions };
        }),
      );
      setSelectedId(newQ.id);
      setSelectedType('question');
    },
    [updateSections],
  );

  const handleSelectQuestion = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedType('question');
  }, []);

  const handleSelectSection = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedType('section');
  }, []);

  const handleUpdateQuestion = useCallback(
    (updated: FormQuestion) => {
      updateSections((sections) =>
        sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => (q.id === updated.id ? updated : q)),
        })),
      );
    },
    [updateSections],
  );

  const handleDeleteQuestion = useCallback(() => {
    if (!selectedId) return;
    updateSections((sections) =>
      sections.map((s) => ({
        ...s,
        questions: s.questions.filter((q) => q.id !== selectedId),
      })),
    );
    setSelectedId(null);
  }, [selectedId, updateSections]);

  const handleUpdateSection = useCallback(
    (updated: FormSection) => {
      updateSections((sections) =>
        sections.map((s) => (s.id === updated.id ? { ...updated, questions: s.questions } : s)),
      );
    },
    [updateSections],
  );

  const handleDeleteSection = useCallback(() => {
    if (!selectedId) return;
    updateSections((sections) => sections.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, updateSections]);

  // ── Click-to-add from palette ──

  const handlePaletteClick = useCallback(
    (type: FormQuestion['type']) => {
      if (config.sections.length === 0) return;
      // Add to the currently selected section, or default to the first section
      const targetSectionId =
        selectedType === 'section' && selectedId
          ? selectedId
          : config.sections[0].id;
      const newQ = createQuestion(type);
      updateSections((sections) =>
        sections.map((s) => {
          if (s.id !== targetSectionId) return s;
          return { ...s, questions: [...s.questions, { ...newQ, position: s.questions.length }] };
        }),
      );
      setSelectedId(newQ.id);
      setSelectedType('question');
    },
    [config.sections, selectedId, selectedType, updateSections],
  );

  // ── Drag handlers ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overId = String(over.id);

      // Palette drop: add new question
      if (activeData?.origin === 'palette') {
        const qType = activeData.questionType as FormQuestion['type'];
        const newQ = createQuestion(qType);

        // Find which section the over target belongs to
        let targetSectionId: string | null = null;

        // Check droppable zone IDs (droppable-<sectionId>)
        const droppablePrefix = 'droppable-';
        if (overId.startsWith(droppablePrefix)) {
          const sectionId = overId.slice(droppablePrefix.length);
          if (config.sections.some((s) => s.id === sectionId)) {
            targetSectionId = sectionId;
          }
        }

        if (!targetSectionId) {
          for (const section of config.sections) {
            if (section.id === overId) {
              targetSectionId = section.id;
              break;
            }
            if (section.questions.some((q) => q.id === overId)) {
              targetSectionId = section.id;
              break;
            }
          }
        }

        // Default to first section
        if (!targetSectionId && config.sections.length > 0) {
          targetSectionId = config.sections[0].id;
        }

        if (targetSectionId) {
          updateSections((sections) =>
            sections.map((s) => {
              if (s.id !== targetSectionId) return s;
              return { ...s, questions: [...s.questions, { ...newQ, position: s.questions.length }] };
            }),
          );
          setSelectedId(newQ.id);
          setSelectedType('question');
        }
        return;
      }

      // Section reorder
      if (activeData?.origin === 'section') {
        const overData = over.data.current;
        if (overData?.origin === 'section') {
          const oldIndex = config.sections.findIndex((s) => s.id === String(active.id));
          const newIndex = config.sections.findIndex((s) => s.id === overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            updateSections((sections) => {
              const reordered = arrayMove(sections, oldIndex, newIndex);
              return reordered.map((s, i) => ({ ...s, position: i }));
            });
          }
        }
        return;
      }

      // Question reorder within or across sections
      if (activeData?.origin === 'question') {
        const activeId = String(active.id);

        // Find source section and index
        let sourceSectionIdx = -1;
        let sourceQuestionIdx = -1;
        for (let si = 0; si < config.sections.length; si++) {
          const qi = config.sections[si].questions.findIndex((q) => q.id === activeId);
          if (qi !== -1) {
            sourceSectionIdx = si;
            sourceQuestionIdx = qi;
            break;
          }
        }

        // Find target section and index
        let targetSectionIdx = -1;
        let targetQuestionIdx = -1;

        for (let si = 0; si < config.sections.length; si++) {
          const qi = config.sections[si].questions.findIndex((q) => q.id === overId);
          if (qi !== -1) {
            targetSectionIdx = si;
            targetQuestionIdx = qi;
            break;
          }
          if (config.sections[si].id === overId) {
            targetSectionIdx = si;
            targetQuestionIdx = config.sections[si].questions.length;
            break;
          }
        }

        if (sourceSectionIdx === -1 || targetSectionIdx === -1) return;

        if (sourceSectionIdx === targetSectionIdx) {
          // Same section reorder
          if (sourceQuestionIdx === targetQuestionIdx) return;
          updateSections((sections) => {
            const newSections = [...sections];
            const questions = arrayMove(
              newSections[sourceSectionIdx].questions,
              sourceQuestionIdx,
              targetQuestionIdx,
            );
            newSections[sourceSectionIdx] = {
              ...newSections[sourceSectionIdx],
              questions: questions.map((q, i) => ({ ...q, position: i })),
            };
            return newSections;
          });
        } else {
          // Move across sections
          updateSections((sections) => {
            const newSections = [...sections];
            const movedQ = newSections[sourceSectionIdx].questions[sourceQuestionIdx];

            newSections[sourceSectionIdx] = {
              ...newSections[sourceSectionIdx],
              questions: newSections[sourceSectionIdx].questions
                .filter((_, i) => i !== sourceQuestionIdx)
                .map((q, i) => ({ ...q, position: i })),
            };

            const targetQuestions = [...newSections[targetSectionIdx].questions];
            targetQuestions.splice(targetQuestionIdx, 0, movedQ);
            newSections[targetSectionIdx] = {
              ...newSections[targetSectionIdx],
              questions: targetQuestions.map((q, i) => ({ ...q, position: i })),
            };

            return newSections;
          });
        }
      }
    },
    [config.sections, updateSections],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col lg:flex-row gap-4 min-h-[600px]">
        {/* Left Panel - Palette */}
        <div className="w-full lg:w-48 flex-shrink-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Field Types</p>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-2">
                {QUESTION_TYPES.map((qt) => (
                  <PaletteItem
                    key={qt.type}
                    type={qt.type}
                    label={qt.label}
                    icon={qt.icon}
                    onClick={() => handlePaletteClick(qt.type as FormQuestion['type'])}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-3">Drag onto a section or click to add</p>
            </div>
          </div>
        </div>

        {/* Center Panel - Form Layout */}
        <div className="flex-1 min-w-0">
          <div className="space-y-3">
            <SortableContext
              items={config.sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {config.sections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  selectedId={selectedId}
                  onSelectQuestion={handleSelectQuestion}
                  onSelectSection={handleSelectSection}
                  onAddQuestion={handleAddQuestion}
                  isSectionSelected={selectedType === 'section' && selectedId === section.id}
                  allSections={config.sections}
                />
              ))}
            </SortableContext>

            {config.sections.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No sections yet. Add one to get started.</p>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={handleAddSection} className="w-full">
              <Plus size={14} className="mr-1.5" /> Add Section
            </Button>
          </div>
        </div>

        {/* Right Panel - Property Editor */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</p>
            </div>
            <ScrollArea className="max-h-[calc(100vh-200px)]">
              <div className="p-4">
                {selectedQuestion ? (
                  <QuestionEditor
                    question={selectedQuestion}
                    allQuestions={allQuestions}
                    onChange={handleUpdateQuestion}
                    onDelete={handleDeleteQuestion}
                  />
                ) : selectedSection ? (
                  <SectionEditor
                    section={selectedSection}
                    allQuestions={allQuestions}
                    allSections={config.sections}
                    onChange={handleUpdateSection}
                    onDelete={handleDeleteSection}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Select a question or section to edit its properties.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragId && (() => {
          // If dragging from the palette, show the field type info
          if (activeDragId.startsWith('palette-')) {
            const fieldType = activeDragId.replace('palette-', '');
            const qtConfig = QUESTION_TYPES.find((qt) => qt.type === fieldType);
            if (qtConfig) {
              const OverlayIcon = qtConfig.icon;
              return (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-lg text-sm font-medium opacity-90">
                  <OverlayIcon size={16} className="text-primary" />
                  {qtConfig.label}
                </div>
              );
            }
          }
          // For questions, show the question label
          const draggedQuestion = allQuestions.find((q) => q.id === activeDragId);
          if (draggedQuestion) {
            const qtConfig = getQuestionTypeConfig(draggedQuestion.type);
            const OverlayIcon = qtConfig?.icon;
            return (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-lg text-sm font-medium opacity-90">
                {OverlayIcon && <OverlayIcon size={14} className="text-muted-foreground" />}
                {draggedQuestion.label}
              </div>
            );
          }
          // For sections, show section title
          const draggedSection = config.sections.find((s) => s.id === activeDragId);
          if (draggedSection) {
            return (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-lg text-sm font-medium opacity-90">
                <GripVertical size={14} className="text-muted-foreground" />
                {draggedSection.title}
              </div>
            );
          }
          return (
            <div className="rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-lg text-sm font-medium opacity-90">
              Dragging...
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
