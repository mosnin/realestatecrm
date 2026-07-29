import { describe, expect, it } from 'vitest';
import { visibleRightPanelTabs } from '@/components/chippi/right-panel-tabs';

describe('Chippi Workbench feature gate', () => {
  it('keeps Workbench out of the customer tab bar while the flag is off', () => {
    expect(visibleRightPanelTabs('realtor', false).map((tab) => tab.id)).not.toContain('workbench');
    expect(visibleRightPanelTabs('broker', false).map((tab) => tab.id)).not.toContain('workbench');
  });

  it('adds Workbench for enabled variants without changing existing tabs', () => {
    expect(visibleRightPanelTabs('realtor', true).map((tab) => tab.id)).toContain('workbench');
    expect(visibleRightPanelTabs('broker', true).map((tab) => tab.id)).toContain('workbench');
    expect(visibleRightPanelTabs('broker', true).map((tab) => tab.id)).not.toContain('documents');
  });
});
