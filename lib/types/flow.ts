import type { Node, Edge } from '@xyflow/react';

// ── Node Data Types ──

export interface StartNodeData {
  label: string;
  greeting: string;
  [key: string]: unknown;
}

export interface QuestionNodeData {
  label: string;
  question: string;
  variableName: string;
  [key: string]: unknown;
}

export interface ConditionNodeData {
  label: string;
  variable: string;
  operator: 'equals' | 'contains' | 'not_empty';
  value: string;
  [key: string]: unknown;
}

export interface ActionNodeData {
  label: string;
  actionType: 'push_to_crm' | 'send_sms' | 'transfer_call' | 'set_variable';
  config: Record<string, string>;
  [key: string]: unknown;
}

export interface EndNodeData {
  label: string;
  outcome: 'qualified' | 'unqualified' | 'callback' | 'transfer';
  message: string;
  [key: string]: unknown;
}

// ── Union Types ──

export type FlowNodeType = 'start' | 'question' | 'condition' | 'action' | 'end';

export type FlowNodeData =
  | StartNodeData
  | QuestionNodeData
  | ConditionNodeData
  | ActionNodeData
  | EndNodeData;

export type FlowNode = Node<FlowNodeData, FlowNodeType>;
export type FlowEdge = Edge;

export interface AgentFlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ── Default node data factories ──

export function createDefaultNodeData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case 'start':
      return { label: 'Greeting', greeting: 'Hello! Thanks for calling. How can I help you today?' };
    case 'question':
      return { label: 'Ask Question', question: 'What is your budget range?', variableName: 'budget' };
    case 'condition':
      return { label: 'Check Condition', variable: 'intent', operator: 'equals', value: 'BUYER' };
    case 'action':
      return { label: 'Push to CRM', actionType: 'push_to_crm', config: {} };
    case 'end':
      return { label: 'End Call', outcome: 'qualified', message: 'Thank you! An agent will follow up shortly.' };
  }
}

// ── Palette items ──

export const NODE_PALETTE: { type: FlowNodeType; label: string; description: string }[] = [
  { type: 'start', label: 'Start / Greeting', description: 'Opening message to the caller' },
  { type: 'question', label: 'Question', description: 'Ask for info (budget, timeline, etc.)' },
  { type: 'condition', label: 'Condition', description: 'Branch based on responses' },
  { type: 'action', label: 'Action', description: 'API call, SMS, or CRM push' },
  { type: 'end', label: 'End', description: 'End the conversation' },
];
