'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  FlowNode,
  FlowNodeType,
  StartNodeData,
  QuestionNodeData,
  ConditionNodeData,
  ActionNodeData,
  EndNodeData,
} from '@/lib/types/flow';

interface PropertiesPanelProps {
  node: FlowNode;
  onUpdate: (id: string, data: Partial<FlowNode['data']>) => void;
}

export function PropertiesPanel({ node, onUpdate }: PropertiesPanelProps) {
  const type = node.type as FlowNodeType;

  function update(partial: Record<string, unknown>) {
    onUpdate(node.id, { ...node.data, ...partial });
  }

  return (
    <div className="w-72 border-l bg-background p-4 overflow-y-auto space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Properties</h3>
        <p className="text-xs text-muted-foreground capitalize">{type} node</p>
      </div>

      {/* Common: Label */}
      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={node.data.label as string}
          onChange={(e) => update({ label: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      {type === 'start' && <StartFields data={node.data as StartNodeData} update={update} />}
      {type === 'question' && <QuestionFields data={node.data as QuestionNodeData} update={update} />}
      {type === 'condition' && <ConditionFields data={node.data as ConditionNodeData} update={update} />}
      {type === 'action' && <ActionFields data={node.data as ActionNodeData} update={update} />}
      {type === 'end' && <EndFields data={node.data as EndNodeData} update={update} />}
    </div>
  );
}

function StartFields({ data, update }: { data: StartNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Greeting Message</Label>
      <Textarea
        value={data.greeting}
        onChange={(e) => update({ greeting: e.target.value })}
        className="text-sm min-h-[80px]"
        placeholder="Hello! Thanks for calling..."
      />
    </div>
  );
}

function QuestionFields({ data, update }: { data: QuestionNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Question to Ask</Label>
        <Textarea
          value={data.question}
          onChange={(e) => update({ question: e.target.value })}
          className="text-sm min-h-[80px]"
          placeholder="What is your budget range?"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Save Answer As Variable</Label>
        <Input
          value={data.variableName}
          onChange={(e) => update({ variableName: e.target.value })}
          className="h-8 text-sm font-mono"
          placeholder="budget"
        />
        <p className="text-[10px] text-muted-foreground">
          Use this variable name in conditions and actions
        </p>
      </div>
    </>
  );
}

function ConditionFields({ data, update }: { data: ConditionNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Variable to Check</Label>
        <Input
          value={data.variable}
          onChange={(e) => update({ variable: e.target.value })}
          className="h-8 text-sm font-mono"
          placeholder="intent"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Operator</Label>
        <Select value={data.operator} onValueChange={(v) => update({ operator: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Equals</SelectItem>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="not_empty">Is Provided</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.operator !== 'not_empty' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Value</Label>
          <Input
            value={data.value}
            onChange={(e) => update({ value: e.target.value })}
            className="h-8 text-sm"
            placeholder="BUYER"
          />
        </div>
      )}
    </>
  );
}

function ActionFields({ data, update }: { data: ActionNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Action Type</Label>
        <Select value={data.actionType} onValueChange={(v) => update({ actionType: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="push_to_crm">Push to CRM</SelectItem>
            <SelectItem value="send_sms">Send SMS</SelectItem>
            <SelectItem value="transfer_call">Transfer Call</SelectItem>
            <SelectItem value="set_variable">Set Variable</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.actionType === 'send_sms' && (
        <div className="space-y-1.5">
          <Label className="text-xs">SMS Message</Label>
          <Textarea
            value={data.config.message ?? ''}
            onChange={(e) => update({ config: { ...data.config, message: e.target.value } })}
            className="text-sm min-h-[60px]"
            placeholder="Thank you for your interest!"
          />
        </div>
      )}
      {data.actionType === 'transfer_call' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Transfer To</Label>
          <Input
            value={data.config.transferTo ?? ''}
            onChange={(e) => update({ config: { ...data.config, transferTo: e.target.value } })}
            className="h-8 text-sm"
            placeholder="a human agent"
          />
        </div>
      )}
      {data.actionType === 'set_variable' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Variable Name</Label>
            <Input
              value={data.config.variable ?? ''}
              onChange={(e) => update({ config: { ...data.config, variable: e.target.value } })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Input
              value={data.config.value ?? ''}
              onChange={(e) => update({ config: { ...data.config, value: e.target.value } })}
              className="h-8 text-sm"
            />
          </div>
        </>
      )}
      {data.actionType === 'push_to_crm' && (
        <p className="text-xs text-muted-foreground">
          Collected variables will be pushed to your leads dashboard via the /api/leads endpoint.
        </p>
      )}
    </>
  );
}

function EndFields({ data, update }: { data: EndNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Outcome</Label>
        <Select value={data.outcome} onValueChange={(v) => update({ outcome: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="unqualified">Unqualified</SelectItem>
            <SelectItem value="callback">Callback Requested</SelectItem>
            <SelectItem value="transfer">Transfer to Agent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Closing Message</Label>
        <Textarea
          value={data.message}
          onChange={(e) => update({ message: e.target.value })}
          className="text-sm min-h-[80px]"
          placeholder="Thank you! An agent will follow up shortly."
        />
      </div>
    </>
  );
}
