"use client";

import { useEffect } from "react";
const SWITCH_FLAG = 'chippi:account-switch';
/** The splash reads this flag so switching workspaces never replays onboarding animation. */
export function triggerAccountSwitch(): void {
  try { sessionStorage.setItem(SWITCH_FLAG, '1'); } catch {}
}
export function peekSwitchFlag(): boolean {
  try { return sessionStorage.getItem(SWITCH_FLAG) === '1'; } catch { return false; }
}
/** Preserve the shared marker protocol without a blocking full-screen transition. */
export function AccountSwitchSwipe() {
  useEffect(() => { try { sessionStorage.removeItem(SWITCH_FLAG); } catch {} }, []);
  return null;
}
