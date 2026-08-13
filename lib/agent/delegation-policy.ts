import type { RunCapability } from './run-policy';

export const MAX_CHILD_DEPTH = 4;
export const MAX_CHILDREN_PER_RUN = 4;

export interface DelegationGrant {
  depth: number;
  grantedCapabilities: RunCapability[];
  deniedCapabilities: RunCapability[];
}

export function deriveChildGrant(input: {
  parent: DelegationGrant;
  requestedCapabilities: readonly RunCapability[];
  additionalDenials?: readonly RunCapability[];
  existingChildren: number;
}): DelegationGrant {
  if (input.existingChildren >= MAX_CHILDREN_PER_RUN) {
    throw new Error('child task quota exhausted');
  }
  if (input.parent.depth >= MAX_CHILD_DEPTH) {
    throw new Error('child task depth exhausted');
  }

  const parentGranted = new Set(input.parent.grantedCapabilities);
  const parentDenied = new Set(input.parent.deniedCapabilities);
  const granted = [...new Set(input.requestedCapabilities)].filter(
    (capability) => parentGranted.has(capability) && !parentDenied.has(capability),
  );
  if (granted.length !== new Set(input.requestedCapabilities).size) {
    throw new Error('child task cannot gain or restore capabilities');
  }

  return {
    depth: input.parent.depth + 1,
    grantedCapabilities: granted,
    deniedCapabilities: [
      ...new Set([...input.parent.deniedCapabilities, ...(input.additionalDenials ?? [])]),
    ],
  };
}
