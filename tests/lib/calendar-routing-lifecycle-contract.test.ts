import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('serverless calendar and routing lifecycle contracts', () => {
  it('retains Google Calendar cleanup after a caller returns', () => {
    const source = readFileSync('lib/gcal-helpers.ts', 'utf8');

    expect(source).toContain('const task = performDeleteGoogleEvent(args)');
    expect(source).toContain('after(() => task)');
    expect(source).toContain('return task');
  });

  it('retains brokerage routing cursor writes after a caller returns', () => {
    const source = readFileSync('lib/brokerage-routing.ts', 'utf8');

    expect(source).toContain('const task = persistCursor(brokerageId, newCursorUserId)');
    expect(source).toContain('after(() => task)');
    expect(source).toContain('await task');
  });

  it('retains detached operational writes and notification delivery', () => {
    const usage = readFileSync('lib/usage/record-chat-usage.ts', 'utf8');
    const telemetry = readFileSync('lib/telemetry.ts', 'utf8');
    const push = readFileSync('lib/push.ts', 'utf8');
    const connections = readFileSync('lib/integrations/connections.ts', 'utf8');
    const executionSteps = readFileSync('lib/agent/tool-call-logger.ts', 'utf8');

    expect(usage).toContain('const task = persistChatUsage(input)');
    expect(usage).toContain('after(() => task)');
    expect(telemetry).toContain('const task = persistTelemetry(args)');
    expect(telemetry).toContain('after(() => task)');
    expect(push).toContain('const task = performPushToSpace(spaceId, payload)');
    expect(push).toContain('after(() => task)');
    expect(connections).toContain('const task = persistExpiredByToolkit(args)');
    expect(connections).toContain('after(() => task)');
    expect(executionSteps).toContain('const task = persistToolCallStart(');
    expect(executionSteps).toContain('const task = persistToolCallComplete(');
    expect(executionSteps).toContain('const task = persistToolCallError(');
    expect(executionSteps.match(/after\(\(\) => task\)/g)).toHaveLength(3);
  });

  it('retains detached agent dispatch and task activity logging', () => {
    const delegation = readFileSync('lib/ai-tools/tools/delegate-task.ts', 'utf8');
    const taskStatus = readFileSync('app/api/agent/tasks/[taskId]/status/route.ts', 'utf8');

    expect(delegation).toContain('const triggerTask = fetch(modalSwarmUrl');
    expect(delegation).toContain('after(() => triggerTask)');
    expect(taskStatus).toContain('const activityTask = Promise.resolve(');
    expect(taskStatus).toContain('after(() => activityTask)');
  });
});
