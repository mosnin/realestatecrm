'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type ReactFlowInstance,
  Panel,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Save,
  Rocket,
  Undo2,
  Redo2,
  Loader2,
  AlertTriangle,
  GripVertical,
  MessageSquare,
  HelpCircle,
  GitBranch,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { flowNodeTypes } from './flow-nodes';
import { PropertiesPanel } from './properties-panel';
import { saveFlow, deployFlow, loadFlow } from './actions';
import { validateFlow } from '@/lib/compile-flow';
import {
  createDefaultNodeData,
  NODE_PALETTE,
  type FlowNode,
  type FlowEdge,
  type FlowNodeType,
} from '@/lib/types/flow';

const paletteIcons: Record<FlowNodeType, React.ComponentType<{ size?: number; className?: string }>> = {
  start: MessageSquare,
  question: HelpCircle,
  condition: GitBranch,
  action: Zap,
  end: CheckCircle2,
};

const paletteColors: Record<FlowNodeType, string> = {
  start: 'text-green-600',
  question: 'text-blue-600',
  condition: 'text-amber-600',
  action: 'text-purple-600',
  end: 'text-red-600',
};

// ── Default starter flow ──

const defaultNodes: FlowNode[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 250, y: 0 },
    data: { label: 'Greeting', greeting: 'Hello! Thanks for calling. How can I help you today?' },
  },
  {
    id: 'q-1',
    type: 'question',
    position: { x: 250, y: 150 },
    data: { label: 'Ask Intent', question: 'Are you looking to buy or sell a property?', variableName: 'intent' },
  },
  {
    id: 'cond-1',
    type: 'condition',
    position: { x: 250, y: 320 },
    data: { label: 'Is Buyer?', variable: 'intent', operator: 'contains' as const, value: 'buy' },
  },
  {
    id: 'q-2',
    type: 'question',
    position: { x: 50, y: 500 },
    data: { label: 'Ask Budget', question: 'What is your budget range?', variableName: 'budget' },
  },
  {
    id: 'q-3',
    type: 'question',
    position: { x: 450, y: 500 },
    data: { label: 'Ask Property', question: 'Tell me about the property you want to sell.', variableName: 'property_details' },
  },
  {
    id: 'action-1',
    type: 'action',
    position: { x: 250, y: 670 },
    data: { label: 'Save Lead', actionType: 'push_to_crm' as const, config: {} },
  },
  {
    id: 'end-1',
    type: 'end',
    position: { x: 250, y: 830 },
    data: { label: 'Qualified End', outcome: 'qualified' as const, message: 'Thank you! One of our agents will follow up with you shortly.' },
  },
];

const defaultEdges: FlowEdge[] = [
  { id: 'e-start-q1', source: 'start-1', target: 'q-1' },
  { id: 'e-q1-cond', source: 'q-1', target: 'cond-1' },
  { id: 'e-cond-yes', source: 'cond-1', target: 'q-2', sourceHandle: 'yes', label: 'Yes' },
  { id: 'e-cond-no', source: 'cond-1', target: 'q-3', sourceHandle: 'no', label: 'No' },
  { id: 'e-q2-action', source: 'q-2', target: 'action-1' },
  { id: 'e-q3-action', source: 'q-3', target: 'action-1' },
  { id: 'e-action-end', source: 'action-1', target: 'end-1' },
];

interface FlowEditorProps {
  spaceId: string;
}

export function FlowEditor({ spaceId }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(defaultEdges);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);

  // Undo/redo history
  const historyRef = useRef<{ nodes: FlowNode[]; edges: FlowEdge[] }[]>([]);
  const historyIndexRef = useRef(-1);

  function pushHistory() {
    const snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    historyIndexRef.current = historyRef.current.length - 1;
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snapshot = historyRef.current[historyIndexRef.current];
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const snapshot = historyRef.current[historyIndexRef.current];
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }

  // Load saved flow on mount
  useEffect(() => {
    loadFlow(spaceId).then((saved) => {
      if (saved && saved.nodes.length > 0) {
        setNodes(saved.nodes);
        setEdges(saved.edges);
        setVersion(saved.version);
      }
      setIsLoaded(true);
      // Initial history snapshot
      historyRef.current = [{
        nodes: JSON.parse(JSON.stringify(saved?.nodes ?? defaultNodes)),
        edges: JSON.parse(JSON.stringify(saved?.edges ?? defaultEdges)),
      }];
      historyIndexRef.current = 0;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      setEdges((eds) => addEdge(connection, eds));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setEdges, nodes, edges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Update node data from properties panel
  const handleNodeDataUpdate = useCallback(
    (id: string, data: Partial<FlowNode['data']>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n))
      );
      setSelectedNode((prev) =>
        prev && prev.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev
      );
    },
    [setNodes]
  );

  // Drag from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/flow-node-type') as FlowNodeType;
      if (!type || !reactFlowInstance.current) return;

      pushHistory();

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: FlowNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: createDefaultNodeData(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNodes, nodes, edges]
  );

  // Delete selected node on backspace/delete
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedNode) {
        pushHistory();
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
        setEdges((eds) =>
          eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
        );
        setSelectedNode(null);
      }
      if (event.key === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (
        (event.key === 'z' && (event.metaKey || event.ctrlKey) && event.shiftKey) ||
        (event.key === 'y' && (event.metaKey || event.ctrlKey))
      ) {
        event.preventDefault();
        redo();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNode, setNodes, setEdges, nodes, edges]
  );

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await saveFlow(spaceId, nodes, edges);
      setVersion(result.version);
      toast.success('Flow saved');
    } catch {
      toast.error('Failed to save flow');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeploy() {
    // Validate first
    const errors = validateFlow(nodes, edges);
    if (errors.length > 0) {
      errors.forEach((e) => toast.error(e));
      return;
    }

    setIsDeploying(true);
    try {
      // Save first
      await saveFlow(spaceId, nodes, edges);
      // Then deploy
      const result = await deployFlow(spaceId);
      if (result.success) {
        toast.success('Flow deployed to your AI agent!');
      } else {
        result.errors?.forEach((e) => toast.error(e));
      }
    } catch {
      toast.error('Failed to deploy flow');
    } finally {
      setIsDeploying(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] border rounded-lg overflow-hidden" onKeyDown={onKeyDown} tabIndex={0}>
      {/* Sidebar palette */}
      <div className="w-56 border-r bg-muted/30 p-3 space-y-3 overflow-y-auto shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Node Palette
        </p>
        <p className="text-[11px] text-muted-foreground">
          Drag nodes onto the canvas
        </p>
        {NODE_PALETTE.map((item) => {
          const Icon = paletteIcons[item.type];
          return (
            <div
              key={item.type}
              className="flex items-start gap-2 p-2.5 rounded-md border bg-background cursor-grab hover:shadow-sm transition-shadow active:cursor-grabbing"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/flow-node-type', item.type);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <GripVertical size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon size={14} className={paletteColors[item.type]} />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onInit={(instance) => {
            reactFlowInstance.current = instance;
          }}
          nodeTypes={flowNodeTypes}
          fitView
          deleteKeyCode={null}
          className="bg-muted/20"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            className="!bg-background !border"
          />

          {/* Top toolbar */}
          <Panel position="top-right" className="flex items-center gap-2">
            {version > 0 && (
              <Badge variant="secondary" className="text-xs">
                v{version}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={undo} title="Undo (Ctrl+Z)">
              <Undo2 size={14} />
            </Button>
            <Button variant="outline" size="sm" onClick={redo} title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
              Save
            </Button>
            <Button
              size="sm"
              onClick={handleDeploy}
              disabled={isDeploying}
            >
              {isDeploying ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Rocket size={14} className="mr-1" />
              )}
              Deploy
            </Button>
          </Panel>

          {/* Validation warnings */}
          <Panel position="bottom-left">
            <ValidationIndicator nodes={nodes} edges={edges} />
          </Panel>
        </ReactFlow>
      </div>

      {/* Properties panel */}
      {selectedNode && (
        <PropertiesPanel node={selectedNode} onUpdate={handleNodeDataUpdate} />
      )}
    </div>
  );
}

function ValidationIndicator({
  nodes,
  edges,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const errors = validateFlow(nodes, edges);
  if (errors.length === 0) return null;

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 max-w-xs">
      <div className="flex items-center gap-1.5 text-destructive text-xs font-medium mb-1">
        <AlertTriangle size={12} />
        {errors.length} issue{errors.length !== 1 ? 's' : ''}
      </div>
      {errors.map((err, i) => (
        <p key={i} className="text-[11px] text-destructive/80">
          {err}
        </p>
      ))}
    </div>
  );
}
