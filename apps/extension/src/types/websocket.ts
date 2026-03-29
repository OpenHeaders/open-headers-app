/**
 * WebSocket-related type definitions.
 *
 * Re-exports canonical types from @openheaders/core and adds
 * extension-specific callback types.
 */

// Re-export shared source types
export type {
  Source,
  SourceType,
  ActivationState,
  SourceMethod,
  SourceHeader,
  SourceQueryParam,
  SourceRequestOptions,
  JsonFilter,
  RefreshType,
  RefreshOptions,
  RefreshStatus,
} from '@openheaders/core/types';

// Re-export protocol message types
export type {
  HeaderRuleFromApp,
  RulesData,
} from '@openheaders/core/protocol';

// Re-export additional rule types used by the extension
export type {
  MatchType,
  ContentType,
  UrlRuleAction,
} from '@openheaders/core/types';

// ── Extension-specific callback types ─────────────────────────────

/** Callback invoked when sources are received from the WebSocket */
export type OnSourcesReceivedCallback = (sources: import('@openheaders/core/types').Source[]) => void;
