/**
 * @openheaders/core — the canonical domain model for the OpenHeaders platform.
 *
 * Prefer subpath imports for tree-shaking:
 *   import type { Source } from '@openheaders/core/types'
 *   import { validateHeaderName } from '@openheaders/core/utils'
 *   import { WS_PORT } from '@openheaders/core/protocol'
 *   import { SourceSchema } from '@openheaders/core/schemas'
 */

// Re-export everything for convenience (full barrel)
export * from './types/index';
export * from './protocol/index';
export * from './utils/index';
export * from './schemas/index';
