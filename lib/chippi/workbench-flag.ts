/** Kept false unless a deployment explicitly opts into the complete slice. */
export function isWorkbenchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED === 'true';
}
