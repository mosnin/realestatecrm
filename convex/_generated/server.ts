// Bootstrap bindings; regenerate with `convex dev` when the deployment is linked.
import { internalMutationGeneric, internalQueryGeneric, internalActionGeneric, httpActionGeneric } from 'convex/server';
import type { MutationBuilder, QueryBuilder, ActionBuilder } from 'convex/server';
import type { DataModel } from './dataModel';
export const internalMutation: MutationBuilder<DataModel, 'internal'> = internalMutationGeneric;
export const internalQuery: QueryBuilder<DataModel, 'internal'> = internalQueryGeneric;
export const internalAction: ActionBuilder<DataModel, 'internal'> = internalActionGeneric;
export const httpAction = httpActionGeneric;
