/**
 * Shared synthetic context generator for test runs — used by both
 * /test-run (whole workflow) and /test-step (single action).
 */

import type { WorkflowContext } from '@/lib/workflows/actions';
import type { WorkflowTrigger } from '@/lib/workflows/schema';

export function sampleContextFor(trigger: WorkflowTrigger): WorkflowContext {
  const sampleLead = {
    id: 'sample',
    name: 'Sample Lead',
    score: 85,
    source: 'zillow',
  };
  const sampleContact = { id: 'sample', name: 'Sample Lead' };

  switch (trigger.type) {
    case 'lead_created':
    case 'lead_score_threshold':
      return {
        event: { type: trigger.type },
        lead: sampleLead,
        contact: sampleContact,
      };
    case 'inbound_message':
      return {
        event: {
          type: 'inbound_message',
          channel: 'sms',
          body: 'Hi, is the listing on Maple St still available?',
        },
        contact: sampleContact,
        lead: sampleLead,
      };
    case 'tour_completed':
      return {
        event: { type: 'tour_completed' },
        contact: sampleContact,
        lead: sampleLead,
        deal: { id: 'sample', stage: 'touring' },
      };
    case 'deal_stage_changed':
      return {
        event: { type: 'deal_stage_changed', toStage: 'offer' },
        contact: sampleContact,
        deal: { id: 'sample', stage: 'offer' },
      };
    case 'integration_event':
      return {
        event: {
          type: 'integration_event',
          toolkit: trigger.config.toolkit,
          event: trigger.config.event,
        },
        contact: sampleContact,
      };
    case 'schedule':
      return { event: { type: 'schedule' } };
    case 'webhook':
      return { event: { type: 'webhook', payload: { sample: true } } };
    default: {
      const _never: never = trigger;
      return { event: { type: String((_never as { type: string }).type) } };
    }
  }
}
