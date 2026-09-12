// @vitest-environment jsdom
import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let listener: ((event: {matches:boolean}) => void) | undefined;
const mounted = vi.fn();
const unmounted = vi.fn();
const removed = vi.fn();
function Child() {
  const { theme, toggleTheme } = useTheme();
  const [draft, setDraft] = useState('');
  useEffect(() => { mounted(); return () => { unmounted(); }; }, []);
  return React.createElement('div', null,
    React.createElement('button', {onClick:toggleTheme}, theme),
    React.createElement('input', {value:draft,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setDraft(e.target.value)}));
}
async function render() { await act(async () => root.render(React.createElement(ThemeProvider, {children:React.createElement(Child)}))); }
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:(_type:string, callback:typeof listener)=>{listener=callback;},removeEventListener:removed}));
  localStorage.clear(); document.documentElement.classList.remove('dark');
  mounted.mockClear(); unmounted.mockClear(); removed.mockClear();
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('loads system appearance without remounting the application', async () => {
  await render(); expect(host.querySelector('button')!.textContent).toBe('dark');
  expect(mounted).toHaveBeenCalledTimes(1); expect(unmounted).not.toHaveBeenCalled();
  const input=host.querySelector('input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Unsaved work'); input.dispatchEvent(new Event('input',{bubbles:true})); });
  await act(async () => host.querySelector('button')!.click());
  expect(input.value).toBe('Unsaved work'); expect(localStorage.getItem('theme')).toBe('light'); expect(mounted).toHaveBeenCalledTimes(1);
});
it('ignores invalid stored preferences and continues following the system', async () => {
  localStorage.setItem('theme','invalid'); await render(); expect(document.documentElement.classList.contains('dark')).toBe(true);
  await act(async () => listener!({matches:false})); expect(host.querySelector('button')!.textContent).toBe('light');
});
it('honors explicit appearance instead of subsequent system changes', async () => {
  localStorage.setItem('theme','light'); await render();
  await act(async () => listener!({matches:true})); expect(host.querySelector('button')!.textContent).toBe('light');
});
it('renders and switches appearance when storage access fails', async () => {
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('storage blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});
  await render(); await act(async () => host.querySelector('button')!.click());
  await act(async () => listener!({matches:true}));
  expect(document.documentElement.classList.contains('dark')).toBe(false); expect(host.querySelector('button')!.textContent).toBe('light'); expect(mounted).toHaveBeenCalledTimes(1);
});
