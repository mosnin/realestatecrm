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

describe('Research Workspace feature gate', () => {
  it('keeps Research out until the explicit server entitlement is present', () => {
    expect(visibleRightPanelTabs('realtor', true, false).map((tab) => tab.id)).not.toContain('research');
    expect(visibleRightPanelTabs('broker', true, false).map((tab) => tab.id)).not.toContain('research');
  });

  it('adds Research only for an entitled workspace', () => {
    expect(visibleRightPanelTabs('realtor', true, true).map((tab) => tab.id)).toContain('research');
  });
});
