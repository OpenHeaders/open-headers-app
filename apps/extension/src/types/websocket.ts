/**
 * WebSocket-related type definitions.
 *
 * Extension-specific callback types.
 * Shared types (Source, HeaderRuleFromApp, RulesData, etc.) are imported
 * directly from '@openheaders/core'.
 */

import type { Source } from '@openheaders/core';

// ── Extension-specific callback types ─────────────────────────────

/** Callback invoked when sources are received from the WebSocket */
export type OnSourcesReceivedCallback = (sources: Source[]) => void;
