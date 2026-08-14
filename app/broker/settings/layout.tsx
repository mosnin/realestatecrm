import type { ReactNode } from 'react';
import { BrokerSettingsSectionNav } from './settings-section-nav';

export default function BrokerSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]"
      data-broker-family="settings-workbench"
      data-primary-work-geometry="settings-index"
    >
      <aside className="lg:sticky lg:top-4">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Brokerage settings
        </p>
        <BrokerSettingsSectionNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
