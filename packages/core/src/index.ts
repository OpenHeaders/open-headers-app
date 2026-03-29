/**
 * @openheaders/core — the canonical domain model for the OpenHeaders platform.
 *
 * Prefer subpath imports for tree-shaking:
 *   import type { Source } from '@openheaders/core/types'
 *   import { validateHeaderName } from '@openheaders/core/utils'
 *   import { WS_PORT } from '@openheaders/core/protocol'
 *   import { SourceSchema } from '@openheaders/core/schemas'
 */

export * from './protocol/index';
export * from './schemas/index';
// Re-export everything for convenience (full barrel)
export * from './types/index';
export * from './utils/index';
