// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PipelineSummary } from '@/components/deals/pipeline-summary';
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('@/components/motion/animated-number', () => ({ AnimatedNumber: ({value}:{value:number}) => React.createElement('span',null,value) }));
afterEach(() => vi.unstubAllGlobals());
it('restores A totals after selecting B and returning to A', async () => {
  const a = [{id:'a',deals:[{id:'a1',status:'active'}]}] as any;
  const b = [{id:'b',deals:[{id:'b1',status:'won',closedAt:new Date().toISOString()}]}];
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>b}));
  const container=document.createElement('div');const root=createRoot(container);
  const render = (pipelineId:string, initialStages?:any) => React.createElement(PipelineSummary,{slug:'test',pipelineId,focus:null,onFocusChange:()=>{},onAddDeal:()=>{},initialStages});
  await act(async()=>root.render(render('a',a)));
  const first=container.textContent;
  await act(async()=>root.render(render('b')));
  expect(container.textContent).not.toBe(first);
  await act(async()=>root.render(render('a',a)));
  expect(container.textContent).toBe(first);
  // A delayed response from B must not overwrite A after the user returns.
  let resolveB!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => { resolveB = resolve; })));
  await act(async()=>root.render(render('b')));
  await act(async()=>root.render(render('a',a)));
  await act(async()=>resolveB({ok:true,json:async()=>b}));
  expect(container.textContent).toBe(first);
  await act(async()=>root.unmount());
});
