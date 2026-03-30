/**
 * Network Type Utilities
 *
 * Utilities for determining and formatting network request types
 * Extracted from RecordNetworkTab for reusability
 */

import type { NetworkRecord } from '@/types/recording';

/**
 * Get request type from network record with intelligent fallbacks
 */
export const getTypeFromRecord = (req: NetworkRecord) => {
  const type = req.type;

  // Handle Chrome DevTools resource types
  if (type && type !== 'fetch' && type !== 'xhr') {
    const typeMap: Record<string, string> = {
      main_frame: 'document',
      sub_frame: 'document',
      stylesheet: 'css',
      script: 'script',
      image: 'img',
      font: 'font',
      xmlhttprequest: 'xhr',
      websocket: 'websocket',
      other: 'other',
    };

    // Special handling for 'other' type
    if (type === 'other') {
      const contentType = req.responseHeaders?.['content-type'];
      const mimeType = contentType ? contentType.split(';')[0] : '';
      if (req.status === 101) return 'websocket';
      if (mimeType.includes('json')) return 'xhr';
      if (mimeType.includes('html')) return 'xhr';
    }

    return typeMap[type] || type;
  }

  // Fallback based on MIME type and other indicators
  const contentType = req.responseHeaders?.['content-type'];
  const mimeType = contentType ? contentType.split(';')[0] : '';
  let shortType = type || 'fetch';

  if (req.method === 'OPTIONS') {
    shortType = 'preflight';
  } else if (req.status === 101) {
    shortType = 'websocket';
  } else if (mimeType) {
    if (mimeType.includes('json')) shortType = 'json';
    else if (mimeType.includes('javascript')) shortType = 'js';
    else if (mimeType.includes('css')) shortType = 'css';
    else if (mimeType.includes('html')) shortType = 'document';
    else if (mimeType.includes('image')) shortType = 'img';
    else if (mimeType.includes('font')) shortType = 'font';
  }

  return shortType;
};

/**
 * Get unique type values from network records for filters
 */
export const getUniqueTypes = (networkRecords: NetworkRecord[]) => {
  if (networkRecords.length === 0) {
    return [];
  }

  const types = new Set<string>();
  for (const record of networkRecords) {
    types.add(getTypeFromRecord(record));
  }
  return Array.from(types).sort();
};

/**
 * Get unique status groups from network records for filters
 */
export const getUniqueStatusGroups = (networkRecords: NetworkRecord[]) => {
  if (networkRecords.length === 0) {
    return [];
  }

  const statusGroups = new Set<string>();
  for (const req of networkRecords) {
    if (req.error) statusGroups.add('Failed');
    else if (!req.status) statusGroups.add('Pending');
    else if (req.status >= 200 && req.status < 300) statusGroups.add('2xx');
    else if (req.status >= 300 && req.status < 400) statusGroups.add('3xx');
    else if (req.status >= 400 && req.status < 500) statusGroups.add('4xx');
    else if (req.status >= 500) statusGroups.add('5xx');
    else statusGroups.add(String(req.status));
  }
  return Array.from(statusGroups).sort();
};

/**
 * Get unique method values from network records for filters
 */
export const getUniqueMethods = (networkRecords: NetworkRecord[]) => {
  if (networkRecords.length === 0) {
    return [];
  }

  const methods = new Set<string>();
  for (const req of networkRecords) {
    if (req.method) {
      methods.add(req.method);
    }
  }
  return Array.from(methods).sort();
};
