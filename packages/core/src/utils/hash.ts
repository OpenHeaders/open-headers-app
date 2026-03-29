/**
 * Fast hashing utilities for change detection.
 *
 * FNV-1a 32-bit — not cryptographic, used for comparing sources/rules
 * to avoid redundant updates.
 */

import type { Source } from '../types/source';
import type { SavedDataMap } from '../types/rules';

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Generate a hash of sources to detect changes.
 */
export function generateSourcesHash(sources: Source[]): string {
  if (!sources || !Array.isArray(sources) || sources.length === 0) return '';

  let combined = '';
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    combined += (s.sourceId || '') + '\0' + (s.sourceContent || '') + '\x01';
  }

  return fnv1a(combined).toString(36);
}

/**
 * Generate a hash of saved data to detect meaningful changes.
 */
export function generateSavedDataHash(savedData: SavedDataMap): string {
  if (!savedData) return '';

  const keys = Object.keys(savedData);
  if (keys.length === 0) return '';

  let combined = '';
  for (let i = 0; i < keys.length; i++) {
    const id = keys[i];
    const e = savedData[id];
    combined += id + '\0' + e.headerName + '\0' + e.headerValue + '\0'
      + (e.isDynamic ? '1' : '0') + '\0' + (e.sourceId || '') + '\0'
      + (e.sourceMissing ? '1' : '0') + '\x01';
  }

  return fnv1a(combined).toString(36);
}
