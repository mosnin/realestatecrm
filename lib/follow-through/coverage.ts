import { createHash } from 'crypto';
import { parseWorkflowDefinition } from '@/lib/workflows/schema';

export const coverageOptions = [
  { key: 'reply', title: 'Continue inbound conversations', description: 'Answer replies using the saved conversation, ask the next useful question, and record a handoff when you are needed.' },
  { key: 'post_tour', title: 'Follow up after completed showings', description: 'Ask for feedback after a completed tour and record the next step. No reply is treated as a confirmed appointment.' },
] as const;
export type CoverageKey = typeof coverageOptions[number]['key'];
export function coverageId(spaceId: string, key: CoverageKey): string {
  const hex = createHash('sha256').update(`chippi:coverage:v1:${spaceId}:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function coverageDefinition(key: CoverageKey) {
  const instruction = key === 'reply'
    ? 'Handle this inbound reply for contact {{lead.id}}. Read their saved contact and conversation history. Respond to their actual message: {{trigger.message}}. Send an email when the inbound channel is email; send an SMS when it is sms. The inbound channel is {{trigger.channel}}. Send one useful, grounded reply. Ask only for missing real-estate needs, location or timing. Do not restart an introduction or invent property facts, availability, agreements, financing or pricing. If a person must decide or the client requests an agent, record a client commitment of kind handoff with no automatic channel, a concise summary and a due date within one hour; keep the human work visible in Today. Respect opt-outs and existing commitments. Never treat a lead score as qualification or a requested time as confirmed access.'
    : 'For contact {{lead.id}}, read the completed tour and recent conversation. If feedback has not already arrived, send one short email asking what worked, what did not, and whether they want help with a next step. Do not claim another showing is confirmed. Record a client commitment of kind handoff with no automatic channel if an agent decision is needed. Use saved facts and respect opt-outs.';
  return parseWorkflowDefinition({
    trigger: key === 'reply' ? { type: 'inbound_message', config: { channel: 'any' } } : { type: 'tour_completed', config: {} },
    conditions: { op: 'and', rules: [{ field: 'contact.id', operator: 'exists' }] },
    actions: [{ type: 'run_chippi', config: { instruction, restrictToTriggerContact: true }, maxRetries: 1, onError: 'stop' }],
    autonomy: 'auto',
  });
}
