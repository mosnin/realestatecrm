'use client';

/**
 * AgentStatusIcon — picks the right animated indicator for what the agent is
 * doing right now. Used in two places:
 *   - ThinkingIndicator (no tool yet) → LoaderIcon (the spinner)
 *   - ToolCallBlockView header when the call is running → CogIcon /
 *     ConnectIcon / FileCogIcon based on what the tool does.
 *
 * Mapping rule (extract, not invent):
 *   connect    — tools that move work between people or processes inbound:
 *                route_lead (brokerage routing), process_inbound_message
 *                (handling a contact's reply).
 *   file-cog   — tools that read or write a document/file/packet:
 *                read_attachment, send_property_packet, add_property.
 *   cog        — every other CRM tool. The default.
 *   loader     — used only by ThinkingIndicator (no tool yet).
 */

import { LoaderIcon } from './loader-icon';
import { CogIcon } from './cog-icon';
import { ConnectIcon } from './connect-icon';
import { FileCogIcon } from './file-cog-icon';

export type AgentStatusIconKind = 'loader' | 'cog' | 'connect' | 'file-cog';

const CONNECTOR_TOOLS = new Set([
  'route_lead',
  'process_inbound_message',
]);

const DOCUMENT_TOOLS = new Set([
  'read_attachment',
  'send_property_packet',
  'add_property',
]);

export function iconKindFor(toolName: string | null | undefined): AgentStatusIconKind {
  if (!toolName) return 'cog';
  if (CONNECTOR_TOOLS.has(toolName)) return 'connect';
  if (DOCUMENT_TOOLS.has(toolName)) return 'file-cog';
  return 'cog';
}

interface AgentStatusIconProps {
  kind: AgentStatusIconKind;
  size?: number;
  className?: string;
}

export function AgentStatusIcon({ kind, size = 14, className }: AgentStatusIconProps) {
  switch (kind) {
    case 'loader':
      return <LoaderIcon autoPlay size={size} className={className} />;
    case 'connect':
      return <ConnectIcon autoPlay size={size} className={className} />;
    case 'file-cog':
      return <FileCogIcon autoPlay size={size} className={className} />;
    case 'cog':
    default:
      return <CogIcon autoPlay size={size} className={className} />;
  }
}
