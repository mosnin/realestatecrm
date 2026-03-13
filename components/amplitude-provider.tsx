'use client';

import { useEffect, useRef } from 'react';
import * as amplitude from '@amplitude/unified';

export function AmplitudeProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    amplitude.initAll('246fdb1876379c5d56ce99456e6ce954', {
      analytics: { autocapture: true },
      sessionReplay: { sampleRate: 1 },
    });
  }, []);

  return <>{children}</>;
}
