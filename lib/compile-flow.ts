import type {
  FlowNode,
  FlowEdge,
  StartNodeData,
  QuestionNodeData,
  ConditionNodeData,
  ActionNodeData,
  EndNodeData,
} from '@/lib/types/flow';

interface CompiledFlow {
  systemPrompt: string;
  firstMessage: string;
  tools: VapiTool[];
}

interface VapiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
  server?: { url: string };
}

/**
 * Compiles a React Flow graph (nodes + edges) into a Vapi-compatible
 * system prompt, first message, and tools array.
 */
export function compileFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  baseUrl: string
): CompiledFlow {
  const startNode = nodes.find((n) => n.type === 'start');
  const firstMessage = startNode
    ? (startNode.data as StartNodeData).greeting
    : 'Hello! How can I help you today?';

  // Build adjacency: nodeId → outgoing edges
  const adjacency = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = adjacency.get(edge.source) ?? [];
    existing.push(edge);
    adjacency.set(edge.source, existing);
  }

  // Walk the graph from start to build ordered steps
  const steps: string[] = [];
  const variables: string[] = [];
  const tools: VapiTool[] = [];
  const visited = new Set<string>();

  function walkNode(nodeId: string, depth: number) {
    if (visited.has(nodeId) || depth > 50) return;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const indent = '  '.repeat(depth);

    switch (node.type) {
      case 'start': {
        const data = node.data as StartNodeData;
        steps.push(`${indent}${steps.length + 1}. GREET the caller: "${data.greeting}"`);
        break;
      }
      case 'question': {
        const data = node.data as QuestionNodeData;
        steps.push(`${indent}${steps.length + 1}. ASK: "${data.question}" → store answer as {${data.variableName}}`);
        variables.push(data.variableName);
        break;
      }
      case 'condition': {
        const data = node.data as ConditionNodeData;
        const outEdges = adjacency.get(nodeId) ?? [];
        const yesEdge = outEdges.find((e) => e.sourceHandle === 'yes');
        const noEdge = outEdges.find((e) => e.sourceHandle === 'no');

        const opText =
          data.operator === 'equals'
            ? `{${data.variable}} equals "${data.value}"`
            : data.operator === 'contains'
              ? `{${data.variable}} contains "${data.value}"`
              : `{${data.variable}} is provided`;

        steps.push(`${indent}${steps.length + 1}. IF ${opText}:`);

        if (yesEdge) {
          steps.push(`${indent}  THEN:`);
          walkNode(yesEdge.target, depth + 2);
        }
        if (noEdge) {
          steps.push(`${indent}  ELSE:`);
          walkNode(noEdge.target, depth + 2);
        }
        return; // Don't fall through to generic edge walking
      }
      case 'action': {
        const data = node.data as ActionNodeData;
        switch (data.actionType) {
          case 'push_to_crm':
            steps.push(`${indent}${steps.length + 1}. ACTION: Use the pushLeadToCRM tool to save the lead data`);
            addCrmTool(tools, baseUrl);
            break;
          case 'send_sms':
            steps.push(`${indent}${steps.length + 1}. ACTION: Send a follow-up SMS to the caller with: "${data.config.message ?? 'Thank you for calling!'}"`);
            break;
          case 'transfer_call':
            steps.push(`${indent}${steps.length + 1}. ACTION: Transfer the call to ${data.config.transferTo ?? 'a human agent'}`);
            break;
          case 'set_variable':
            steps.push(`${indent}${steps.length + 1}. ACTION: Set {${data.config.variable ?? 'status'}} = "${data.config.value ?? ''}"`);
            break;
        }
        break;
      }
      case 'end': {
        const data = node.data as EndNodeData;
        steps.push(`${indent}${steps.length + 1}. END (${data.outcome}): "${data.message}"`);
        return;
      }
    }

    // Walk default outgoing edges (non-conditional)
    const outEdges = adjacency.get(nodeId) ?? [];
    for (const edge of outEdges) {
      if (!edge.sourceHandle || edge.sourceHandle === 'default') {
        walkNode(edge.target, depth);
      }
    }
  }

  if (startNode) {
    walkNode(startNode.id, 0);
  }

  // Also walk any unvisited nodes (disconnected)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      walkNode(node.id, 0);
    }
  }

  const variablesList =
    variables.length > 0
      ? `\n\nVariables to collect during conversation:\n${variables.map((v) => `- {${v}}`).join('\n')}`
      : '';

  const systemPrompt = `You are an AI real estate assistant. Follow this exact conversation flow:

${steps.join('\n')}${variablesList}

Important guidelines:
- Be friendly, professional, and conversational
- Do not sound robotic or scripted
- If the caller goes off-topic, gently guide them back to the flow
- Collect all required information naturally through conversation
- Summarize the conversation at the end`;

  return { systemPrompt, firstMessage, tools };
}

function addCrmTool(tools: VapiTool[], baseUrl: string) {
  // Don't add duplicates
  if (tools.some((t) => t.function.name === 'pushLeadToCRM')) return;

  tools.push({
    type: 'function',
    function: {
      name: 'pushLeadToCRM',
      description: 'Save qualified lead information to the CRM database',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "Caller's full name" },
          phone: { type: 'string', description: "Caller's phone number" },
          intent: { type: 'string', description: 'BUYER, SELLER, or BOTH' },
          budget: { type: 'string', description: 'Budget range e.g. "$400k-$600k"' },
          timeline: { type: 'string', description: 'Timeline e.g. "within 3 months"' },
          areas: { type: 'string', description: 'Comma-separated preferred areas' },
        },
        required: ['phone', 'intent'],
      },
    },
    server: {
      url: `${baseUrl}/api/leads`,
    },
  });
}

/**
 * Validates a flow graph and returns any errors.
 */
export function validateFlow(
  nodes: FlowNode[],
  edges: FlowEdge[]
): string[] {
  const errors: string[] = [];

  const startNodes = nodes.filter((n) => n.type === 'start');
  if (startNodes.length === 0) errors.push('Flow must have a Start node');
  if (startNodes.length > 1) errors.push('Flow can only have one Start node');

  const endNodes = nodes.filter((n) => n.type === 'end');
  if (endNodes.length === 0) errors.push('Flow must have at least one End node');

  // Check start has outgoing edges
  if (startNodes.length === 1) {
    const startEdges = edges.filter((e) => e.source === startNodes[0].id);
    if (startEdges.length === 0) errors.push('Start node must connect to another node');
  }

  // Check for orphan nodes (no incoming or outgoing, except start)
  for (const node of nodes) {
    if (node.type === 'start') continue;
    const incoming = edges.filter((e) => e.target === node.id);
    if (incoming.length === 0) {
      errors.push(`"${node.data.label}" has no incoming connections`);
    }
  }

  return errors;
}
