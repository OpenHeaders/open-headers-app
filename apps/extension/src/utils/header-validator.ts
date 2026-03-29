/**
 * Header validation utilities.
 *
 * Re-exports from @openheaders/core — single source of truth.
 */

export type { HeaderNameValidation as ValidationResult } from '@openheaders/core/types';
export {
  sanitizeHeaderValue,
  validateHeaderName,
  validateHeaderValue,
} from '@openheaders/core/utils';
