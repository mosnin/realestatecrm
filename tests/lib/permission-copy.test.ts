import { describe, expect, it } from 'vitest';
import {
  permissionArgFields,
  permissionPromptDescription,
  permissionPromptTitle,
} from '@/lib/ai-tools/permission-copy';

describe('permission copy', () => {
  it('asks about the action instead of naming the tool', () => {
    expect(permissionPromptTitle('send_email', 'Email Jane')).toBe('Allow this email to send?');
    expect(permissionPromptTitle('move_deal_stage', 'Move deal abc → Offer')).toBe('Move this deal?');
    expect(permissionPromptTitle(
      'move_deal_stage',
      'Move deal aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee → stage ffff',
      { dealTitle: 'Oak Street', stageName: 'Under contract' },
    )).toBe('Move Oak Street to Under contract?');
    expect(permissionPromptTitle('create_deal', 'Create deal "Oak St"', { title: 'Oak St' }))
      .toBe('Create deal "Oak St"?');
    expect(permissionPromptTitle('unknown_tool', '')).toBe('Allow this action?');
  });

  it('hides UUID summaries from the approval chrome', () => {
    expect(permissionPromptDescription('Move deal aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee → stage x'))
      .toBeUndefined();
    expect(permissionPromptDescription('Create deal "Oak Street"')).toBe('Create deal "Oak Street"');
  });

  it('surfaces labeled fields and hides ids', () => {
    expect(permissionArgFields('create_deal', {
      title: 'Oak Street',
      value: 450000,
      dealId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })).toEqual([
      { label: 'Deal', value: 'Oak Street' },
      { label: 'Value', value: '$450,000' },
    ]);
  });
});
