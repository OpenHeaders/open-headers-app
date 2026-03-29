/**
 * WebSocket-related type definitions.
 *
 * Re-exports canonical types from @openheaders/core and adds
 * extension-specific callback types.
 */

// Re-export protocol message types
export type {
  HeaderRuleFromApp,
  RulesData,
} from '@openheaders/core/protocol';
// Re-export shared source types
// Re-export additional rule types used by the extension
export type {
  ActivationState,
  ContentType,
  JsonFilter,
  MatchType,
  RefreshOptions,
  RefreshStatus,
  RefreshType,
  Source,
  SourceHeader,
  SourceMethod,
  SourceQueryParam,
  SourceRequestOptions,
  SourceType,
  UrlRuleAction,
} from '@openheaders/core/types';

// ── Extension-specific callback types ─────────────────────────────

/** Callback invoked when sources are received from the WebSocket */
export type OnSourcesReceivedCallback = (sources: import('@openheaders/core/types').Source[]) => void;
