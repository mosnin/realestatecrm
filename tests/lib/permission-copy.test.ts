import { describe, expect, it } from 'vitest';
import { permissionArgFields, permissionPromptTitle } from '@/lib/ai-tools/permission-copy';

describe('permission copy', () => {
  it('asks about the action instead of naming the tool', () => {
    expect(permissionPromptTitle('send_email', 'Email Jane')).toBe('Allow this email to send?');
    expect(permissionPromptTitle('move_deal_stage', 'Move deal abc → Offer')).toBe('Move this deal?');
    expect(permissionPromptTitle('create_deal', 'Create deal "Oak St"')).toBe('Create this deal?');
    expect(permissionPromptTitle('unknown_tool', '')).toBe('Allow this action?');
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
