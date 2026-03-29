/**
 * Header-related type definitions.
 *
 * Re-exports canonical types from @openheaders/core and adds
 * extension-specific types for declarativeNetRequest.
 */

// Re-export shared types
export type {
  HeaderEntry,
  SavedDataMap,
  HeaderValueValidation,
} from '@openheaders/core/types';

/** A fully resolved entry — safe to create a DNR rule */
export interface ResolvedEntry {
  headerName: string;
  headerValue: string;
  domains: string[];
  isResponse: boolean;
}

/** Reasons a header may use a placeholder value */
export type PlaceholderReason =
  | 'source_not_found'
  | 'empty_source'
  | 'empty_value';

/** Information about a header using a placeholder */
export interface PlaceholderInfo {
  headerName: string;
  sourceId?: string | number | null;
  reason: PlaceholderReason;
  domains: string[];
}

/** Result of processing a single HeaderEntry */
export type EntryResult =
  | { resolved: true; entry: ResolvedEntry }
  | { resolved: false; placeholder: PlaceholderInfo };

/** A header rule suitable for chrome.declarativeNetRequest */
export interface HeaderDnrRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    requestHeaders?: HeaderModification[];
    responseHeaders?: HeaderModification[];
  };
  condition: {
    urlFilter: string;
    resourceTypes: chrome.declarativeNetRequest.ResourceType[];
  };
}

/** A single header modification operation */
export interface HeaderModification {
  header: string;
  operation: 'set' | 'remove' | 'append';
  value: string;
}
