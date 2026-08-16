import { afterEach, describe, it, expect, vi } from 'vitest';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import {
  CORE_TOOL_NAMES,
  TOOLSETS,
  selectToolsets,
  getChatTools,
  isUnsupportedPdfDeliverableIntent,
  selectDirectExecutionToolNames,
} from '@/lib/ai-tools/toolsets';
import { isResearchWorkspaceIntent } from '@/lib/chippi/research-workspace-intent';

const ALL_NAMES = new Set(ALL_TOOLS.map((t) => t.name));

afterEach(() => vi.unstubAllEnvs());

describe('toolsets — per-turn selection', () => {
  it('every CORE + TOOLSET name is a real registered tool (no typos)', () => {
    const names = [...CORE_TOOL_NAMES, ...Object.values(TOOLSETS).flat()];
    const missing = names.filter((n) => !ALL_NAMES.has(n));
    expect(missing).toEqual([]);
  });

  it('no tool is assigned to two toolsets, and none is also core', () => {
    const seen = new Map<string, string>();
    for (const n of CORE_TOOL_NAMES) seen.set(n, 'core');
    for (const [set, names] of Object.entries(TOOLSETS)) {
      for (const n of names) {
        expect(seen.has(n), `${n} already in ${seen.get(n)}`).toBe(false);
        seen.set(n, set);
      }
    }
  });

  it('every tool is reachable — getChatTools over all toolsets covers ALL_TOOLS', () => {
    // Conditional tools still need registry reachability coverage. Opt in for
    // this assertion only; production remains feature-off by default.
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'true');
    // A message that trips every pattern + core + orphans must surface the
    // whole catalog. Guards against a tool silently becoming uncallable.
    const everyKeyword =
      'person deal tour property calendar send pipeline broker file plan browser continue workspace generate image';
    // Send and draft catalogs are intentionally mutually exclusive on a turn,
    // so reachability is the union of an execution request and an explicit
    // drafting request rather than one contradictory mega-prompt.
    const reachable = new Set([
      ...getChatTools(everyKeyword, {
        workspaceContinuationEligible: true,
      }).map((t) => t.name),
      ...getChatTools('draft an email and text message').map((t) => t.name),
      ...getChatTools('create an automation').map((t) => t.name),
      ...getChatTools('prepare a comprehensive research report', { workMode: true }).map(
        (t) => t.name,
      ),
      ...getChatTools('delete the contact', { workMode: true }).map((t) => t.name),
      ...getChatTools('archive the contact', { workMode: true }).map((t) => t.name),
      ...getChatTools('merge two contacts', { workMode: true }).map((t) => t.name),
      ...getChatTools('delete the deal', { workMode: true }).map((t) => t.name),
      ...getChatTools('cancel the tour', { workMode: true }).map((t) => t.name),
      ...getChatTools('delete the tour', { workMode: true }).map((t) => t.name),
      ...getChatTools('delete the property', { workMode: true }).map((t) => t.name),
    ]);
    const unreachable = [...ALL_NAMES].filter((n) => !reachable.has(n));
    expect(unreachable).toEqual([]);
  });

  it('a simple read loads core only — far fewer tools than the full catalog', () => {
    const tools = getChatTools('who are my leads');
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_contacts');
    expect(names).toContain('find_person');
    // The whole point: a simple read does NOT ship the full catalog.
    expect(tools.length).toBeLessThan(ALL_TOOLS.length);
  });

  it('does not expose continuation schema without server-verified eligibility', () => {
    const request = 'continue the completed workspace with the seller review';
    expect(getChatTools(request).map((tool) => tool.name)).not.toContain('continue_workspace_run');
    expect(getChatTools(request, { workspaceContinuationEligible: false }).map((tool) => tool.name)).not.toContain('continue_workspace_run');
    expect(getChatTools(request, { workspaceContinuationEligible: true }).map((tool) => tool.name)).toContain('continue_workspace_run');
  });

  it('exposes durable work only after the user explicitly selects Work mode', () => {
    expect(getChatTools('prepare a finished market report').map((tool) => tool.name)).not.toContain(
      'start_work_session',
    );
    expect(
      getChatTools('prepare a finished market report', { workMode: true }).map(
        (tool) => tool.name,
      ),
    ).toContain('start_work_session');
  });

  it('routes a downloadable Markdown report to durable work', () => {
    const names = getChatTools(
      'Go through my contacts and make a downloadable report ranking the best people',
      { workMode: true },
    ).map((tool) => tool.name);
    expect(names).toContain('start_work_session');
  });

  it('fails the observed PDF request honestly instead of exposing fake artifact work', () => {
    const request =
      'Set this as the active Work goal: go through my contacts and make a downloadable pdf based on who the best leads are in order';
    const names = getChatTools(request, { workMode: true }).map((tool) => tool.name);

    expect(isUnsupportedPdfDeliverableIntent(request)).toBe(true);
    expect(names).not.toContain('start_work_session');
    expect(names).not.toContain('create_plan');
  });

  it('does not mistake reading an uploaded PDF for unsupported PDF creation', () => {
    const request = 'Read the uploaded PDF and summarize the seller disclosures';
    expect(isUnsupportedPdfDeliverableIntent(request)).toBe(false);
  });

  it('keeps create_plan available throughout Work without adding it to simple Chat', () => {
    expect(getChatTools('find Jane').map((tool) => tool.name)).not.toContain('create_plan');
    expect(
      getChatTools('find Jane', { workMode: true }).map((tool) => tool.name),
    ).toContain('create_plan');
  });

  it('gives a Work browser goal the durable bridge and both bounded browser controls', () => {
    const names = getChatTools(
      'Use the browser to research three current listings and compare them',
      { workMode: true },
    ).map((tool) => tool.name);
    expect(names).toContain('start_work_session');
    expect(names).toContain('browser_task');
    expect(names).toContain('control_browser');
  });

  it('a tour request pulls in the tours toolset', () => {
    const names = getChatTools('schedule a tour for Sam on Friday').map((t) => t.name);
    expect(names).toContain('schedule_tour');
  });

  it('always returns a subset of ALL_TOOLS', () => {
    for (const msg of ['hello', 'who are my leads', 'send an email to Jane', '']) {
      const names = getChatTools(msg).map((t) => t.name);
      expect(names.every((n) => ALL_NAMES.has(n))).toBe(true);
    }
  });

  it('selectToolsets maps keywords to sets', () => {
    expect(selectToolsets('move the deal to closing')).toContain('deals');
    expect(selectToolsets('find a comparable property')).toContain('properties');
    expect(selectToolsets('hello there')).toEqual([]);
  });

  it.each([
    'Research current mortgage rates from three public sources',
    'compare sources for latest market data',
    'find latest rate data',
  ])('gives each canonical Research Workspace prompt the browser tools: %s', (message) => {
    expect(isResearchWorkspaceIntent(message)).toBe(true);
    const names = getChatTools(message).map((tool) => tool.name);
    expect(names).toContain('browser_task');
    expect(names).toContain('control_browser');
  });

  it('does not add browser tools to ordinary CRM work', () => {
    const message = 'set a follow-up for my lead next Tuesday';
    expect(isResearchWorkspaceIntent(message)).toBe(false);
    expect(getChatTools(message).map((tool) => tool.name)).not.toContain('browser_task');
  });

  describe('Work mode exact-action catalog scoping', () => {
    const mutationNamesFor = (message: string) =>
      getChatTools(message, { workMode: true })
        .filter((tool) => tool.requiresApproval !== false)
        .map((tool) => tool.name);

    it('authorizes add_person for explicit contact creation without destructive siblings', () => {
      const message = 'Create a contact named Jane Smith with jane@example.com';
      const tools = getChatTools(message, { workMode: true });
      expect(tools.map((tool) => tool.name)).toContain('add_person');
      expect(selectDirectExecutionToolNames(message, tools)).toEqual(['add_person']);
      expect(mutationNamesFor(message)).not.toContain('delete_contact');
      expect(mutationNamesFor(message)).not.toContain('archive_person');
    });

    it('keeps property-value analysis grounded and read-only', () => {
      const tools = getChatTools('Analyze nearby property values for 10 Main Street', {
        workMode: true,
      });
      expect(tools.map((tool) => tool.name)).toContain('analyze_property_values');
      expect(tools.filter((tool) => tool.requiresApproval !== false)).toEqual([]);
    });

    it('authorizes send_email for an explicit email send without stripping other useful mutators', () => {
      const message = "Send an email to Jane about tomorrow's showing";
      const tools = getChatTools(message, { workMode: true });
      expect(tools.map((tool) => tool.name)).toContain('send_email');
      expect(tools.map((tool) => tool.name)).toContain('schedule_tour');
      expect(selectDirectExecutionToolNames(message, tools)).toEqual(['send_email']);
      expect(mutationNamesFor(message)).not.toContain('cancel_tour');
      expect(mutationNamesFor(message)).not.toContain('delete_tour');
    });

    it('keeps both send_email and schedule_tour for a multi-step Work request', () => {
      const message = 'Email Sarah and schedule a tour for Friday';
      const tools = getChatTools(message, { workMode: true });
      const names = tools.map((tool) => tool.name);
      expect(names).toContain('send_email');
      expect(names).toContain('schedule_tour');
      expect(selectDirectExecutionToolNames(message, tools)).toEqual(
        expect.arrayContaining(['send_email', 'schedule_tour']),
      );
      expect(selectDirectExecutionToolNames(message, tools)).toHaveLength(2);
    });

    it('keeps goal tools available on a short Work follow-up', () => {
      const goal = 'Email Sarah and schedule a tour at the Oak Street listing';
      const tools = getChatTools('Continue', { workMode: true, conversationGoal: goal });
      const names = tools.map((tool) => tool.name);
      expect(names).toContain('send_email');
      expect(names).toContain('schedule_tour');
      expect(selectDirectExecutionToolNames('Continue', tools, goal)).toEqual(
        expect.arrayContaining(['send_email', 'schedule_tour']),
      );
      expect(selectDirectExecutionToolNames('Continue', tools, goal)).toHaveLength(2);
    });

    it('does not inherit the goal mutation grant for a new question', () => {
      const goal = 'Email Sarah about the showing';
      const tools = getChatTools("What's the weather in Austin?", {
        workMode: true,
        conversationGoal: goal,
      });
      expect(selectDirectExecutionToolNames("What's the weather in Austin?", tools, goal)).toEqual(
        [],
      );
      expect(tools.map((tool) => tool.name)).toContain('get_weather');
    });

    it('always loads the reads the Work prompt names', () => {
      const names = getChatTools('find Jane', { workMode: true }).map((tool) => tool.name);
      expect(names).toContain('analyze_property_values');
      expect(names).toContain('workspace_stats');
      expect(names).toContain('get_weather');
      expect(names).toContain('find_property');
      expect(names).toContain('find_tours');
      expect(names).toContain('create_plan');
    });

    it('treats an automation description as one automation mutation', () => {
      const message = 'Create an automation that emails every new lead immediately';
      const tools = getChatTools(message, { workMode: true });
      expect(tools.map((tool) => tool.name)).toContain('create_automation');
      expect(selectDirectExecutionToolNames(message, tools)).toEqual(['create_automation']);
      expect(mutationNamesFor(message)).not.toContain('send_email');
      expect(mutationNamesFor(message)).not.toContain('add_person');
    });

    it.each([
      ['delete the contact named Jane', 'delete_contact'],
      ['archive the contact named Jane', 'archive_person'],
      ['merge the contacts for Jane Smith and Jane Doe', 'merge_persons'],
      ['delete the deal named Oak Street', 'delete_deal'],
      ['cancel the tour for Friday', 'cancel_tour'],
      ['delete the tour for Friday', 'delete_tour'],
      ['delete the property at 10 Main Street', 'delete_property'],
    ])('authorizes only the requested destructive tool: %s', (message, expected) => {
      const tools = getChatTools(message, { workMode: true });
      const names = tools.map((tool) => tool.name);
      expect(names).toContain(expected);
      expect(selectDirectExecutionToolNames(message, tools)).toEqual([expected]);
      for (const other of [
        'delete_contact',
        'archive_person',
        'merge_persons',
        'delete_deal',
        'cancel_tour',
        'delete_tour',
        'delete_property',
      ]) {
        if (other !== expected) expect(names).not.toContain(other);
      }
    });

    it('does not expose destructive siblings for ordinary Work-mode requests', () => {
      const names = getChatTools('Find the contact and analyze the property', {
        workMode: true,
      }).map((tool) => tool.name);
      expect(names).not.toContain('archive_person');
      expect(names).not.toContain('merge_persons');
      expect(names).not.toContain('delete_contact');
      expect(names).not.toContain('delete_deal');
      expect(names).not.toContain('cancel_tour');
      expect(names).not.toContain('delete_tour');
      expect(names).not.toContain('delete_property');
    });

    it('returns only selected, explicitly requested mutators for direct execution', () => {
      const message = 'Send an email to Jane about tomorrow';
      const tools = getChatTools(message, { workMode: true });
      expect(selectDirectExecutionToolNames(message, tools)).toEqual(['send_email']);
      expect(selectDirectExecutionToolNames('Find Jane', tools)).toEqual([]);
    });

    it('does not mistake contact context or an email-address lookup for a mutation', () => {
      const logMessage = 'Log a call with the new lead Jane';
      const logTools = getChatTools(logMessage, { workMode: true });
      expect(selectDirectExecutionToolNames(logMessage, logTools)).toEqual(['log_call']);
      expect(logTools.map((tool) => tool.name)).toContain('log_call');
      expect(selectDirectExecutionToolNames(logMessage, logTools)).not.toContain('add_person');

      const lookupMessage = 'Email addresses for the new leads';
      const lookupTools = getChatTools(lookupMessage, { workMode: true });
      expect(selectDirectExecutionToolNames(lookupMessage, lookupTools)).toEqual([]);
    });

    it('authorizes browser mutators only for an explicit browser-control request', () => {
      const message = 'Use the browser to research three current listings';
      const tools = getChatTools(message, { workMode: true });
      expect(selectDirectExecutionToolNames(message, tools)).toEqual([
        'control_browser',
        'browser_task',
      ]);
      expect(selectDirectExecutionToolNames('Research three current listings', tools)).toEqual(
        [],
      );
    });

    it('authorizes Studio generation only for an explicit image request', () => {
      const message = 'Generate a listing image for 10 Main Street';
      const tools = getChatTools(message, { workMode: true });
      expect(tools.map((tool) => tool.name)).toContain('generate_studio_image');
      expect(selectDirectExecutionToolNames(message, tools)).toEqual([
        'generate_studio_image',
      ]);
      expect(selectDirectExecutionToolNames('Find the listing photos', tools)).toEqual([]);
    });
  });
});
