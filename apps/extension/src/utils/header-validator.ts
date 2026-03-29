/**
 * Header validation utilities.
 *
 * Re-exports from @openheaders/core — single source of truth.
 */

export {
  validateHeaderName,
  validateHeaderValue,
  sanitizeHeaderValue,
} from '@openheaders/core/utils';

export type { HeaderNameValidation as ValidationResult } from '@openheaders/core/types';
