'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  MessageSquare,
  HelpCircle,
  GitBranch,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import type {
  StartNodeData,
  QuestionNodeData,
  ConditionNodeData,
  ActionNodeData,
  EndNodeData,
} from '@/lib/types/flow';

const nodeBase =
  'rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px] text-left';

// ── Start Node ──

export const StartNode = memo(function StartNode({
  data,
  selected,
}: NodeProps) {
  const d = data as StartNodeData;
  return (
    <div
      className={`${nodeBase} bg-green-50 dark:bg-green-950 ${selected ? 'border-green-600 ring-2 ring-green-300' : 'border-green-400'}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-green-200 dark:border-green-800 bg-green-100 dark:bg-green-900 rounded-t-lg">
        <MessageSquare size={14} className="text-green-700 dark:text-green-400" />
        <span className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wider">
          Start
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
          {d.greeting}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-green-700"
      />
    </div>
  );
});

// ── Question Node ──

export const QuestionNode = memo(function QuestionNode({
  data,
  selected,
}: NodeProps) {
  const d = data as QuestionNodeData;
  return (
    <div
      className={`${nodeBase} bg-blue-50 dark:bg-blue-950 ${selected ? 'border-blue-600 ring-2 ring-blue-300' : 'border-blue-400'}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-blue-700"
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900 rounded-t-lg">
        <HelpCircle size={14} className="text-blue-700 dark:text-blue-400" />
        <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
          Question
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
          &ldquo;{d.question}&rdquo;
        </p>
        <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 font-mono">
          → {`{${d.variableName}}`}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-blue-700"
      />
    </div>
  );
});

// ── Condition Node ──

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps) {
  const d = data as ConditionNodeData;
  const opLabel =
    d.operator === 'equals'
      ? '='
      : d.operator === 'contains'
        ? 'contains'
        : 'exists';
  return (
    <div
      className={`${nodeBase} bg-amber-50 dark:bg-amber-950 ${selected ? 'border-amber-600 ring-2 ring-amber-300' : 'border-amber-400'}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-amber-700"
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800 bg-amber-100 dark:bg-amber-900 rounded-t-lg">
        <GitBranch size={14} className="text-amber-700 dark:text-amber-400" />
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
          Condition
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="text-[11px] text-muted-foreground mt-1 font-mono">
          {`{${d.variable}}`} {opLabel} &ldquo;{d.value}&rdquo;
        </p>
      </div>
      <div className="flex justify-between px-3 pb-2">
        <span className="text-[10px] text-green-600 font-medium">Yes</span>
        <span className="text-[10px] text-red-500 font-medium">No</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!w-3 !h-3 !bg-green-500 !border-green-700"
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!w-3 !h-3 !bg-red-500 !border-red-700"
        style={{ left: '70%' }}
      />
    </div>
  );
});

// ── Action Node ──

const actionLabels: Record<string, string> = {
  push_to_crm: 'Push to CRM',
  send_sms: 'Send SMS',
  transfer_call: 'Transfer Call',
  set_variable: 'Set Variable',
};

export const ActionNode = memo(function ActionNode({
  data,
  selected,
}: NodeProps) {
  const d = data as ActionNodeData;
  return (
    <div
      className={`${nodeBase} bg-purple-50 dark:bg-purple-950 ${selected ? 'border-purple-600 ring-2 ring-purple-300' : 'border-purple-400'}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-purple-700"
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-200 dark:border-purple-800 bg-purple-100 dark:bg-purple-900 rounded-t-lg">
        <Zap size={14} className="text-purple-700 dark:text-purple-400" />
        <span className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wider">
          Action
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {actionLabels[d.actionType] ?? d.actionType}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-500 !border-purple-700"
      />
    </div>
  );
});

// ── End Node ──

const outcomeLabels: Record<string, string> = {
  qualified: 'Qualified',
  unqualified: 'Unqualified',
  callback: 'Callback',
  transfer: 'Transfer',
};

export const EndNode = memo(function EndNode({
  data,
  selected,
}: NodeProps) {
  const d = data as EndNodeData;
  return (
    <div
      className={`${nodeBase} bg-red-50 dark:bg-red-950 ${selected ? 'border-red-600 ring-2 ring-red-300' : 'border-red-400'}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-500 !border-red-700"
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-900 rounded-t-lg">
        <CheckCircle2 size={14} className="text-red-700 dark:text-red-400" />
        <span className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wider">
          End
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {outcomeLabels[d.outcome] ?? d.outcome}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
          &ldquo;{d.message}&rdquo;
        </p>
      </div>
    </div>
  );
});

// ── Export nodeTypes map ──

export const flowNodeTypes = {
  start: StartNode,
  question: QuestionNode,
  condition: ConditionNode,
  action: ActionNode,
  end: EndNode,
};
