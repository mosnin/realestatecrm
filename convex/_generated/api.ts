// Bootstrap bindings; regenerate with `convex dev` when the deployment is linked.
import { anyApi } from 'convex/server';
import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server';
import type * as followUps from '../followUps';
const fullApi = anyApi as unknown as ApiFromModules<{ followUps: typeof followUps }>;
export const internal = fullApi as FilterApi<typeof fullApi, FunctionReference<any, 'internal'>>;
