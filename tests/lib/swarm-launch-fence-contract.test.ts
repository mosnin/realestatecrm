import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('specialist SwarmRun durable launch fence contract', () => {
  it('moves both producers onto the Cloudflare swarm-run-launch queue', () => {
    const route = read('app/api/swarm/route.ts');
    const realtime = read('app/api/ai/realtime-delegate/route.ts');
    const chatDelegate = read('lib/ai-tools/tools/delegate-task.ts');
    const launch = read('lib/swarm-launch.ts');

    expect(route).toContain('createAndEnqueueSwarmRun');
    expect(realtime).toContain('createAndEnqueueSwarmRun');
    expect(launch).toContain("enqueueWorkerTask('swarm-run-launch'");
    expect(launch).toContain("enqueueWorkerTask('swarm-run-timeout'");
    expect(route).not.toContain('fetch(runtime.url');
    expect(realtime).not.toContain('fetch(modalSwarmUrl');
    expect(chatDelegate).not.toContain('fetch(modalSwarmUrl');
    expect(route).not.toContain('after(() => triggerTask)');
    expect(chatDelegate).not.toContain('after(() => triggerTask)');
    expect(chatDelegate).toContain('runDelegatedChildTurn');
  });

  it('uses a strict internal task route and the same token for delayed timeout recovery', () => {
    const route = read('app/api/internal/swarm-runs/launch/route.ts');
    const worker = read('worker/src/index.ts');

    expect(route).toContain("task: z.literal('swarm-run-launch')");
    expect(route).toContain('launchToken: z.string().uuid()');
    expect(route).toContain('claim_swarm_launch');
    expect(route).toContain('enqueueWorkerTask');
    expect(route).toContain("'swarm-run-timeout'");
    expect(worker).toContain("msg.task === 'swarm-run-launch'");
    expect(worker).toContain("'/api/internal/swarm-runs/launch'");
  });

  it('requires Modal to accept the database token before the orchestrator can spend', () => {
    const modal = read('agent/modal_app.py');
    const orchestrator = read('agent/swarm_orchestrator.py');

    expect(modal).toContain('accept_swarm_launch');
    expect(modal).toContain('launchToken');
    expect(orchestrator).toContain('"p_launch_token": launch_token');
    expect(orchestrator).toContain('transition_fenced_swarm_run');
    expect(orchestrator).not.toContain('acquire_swarm_lock(space_id, swarm_run_id)');
  });
});
