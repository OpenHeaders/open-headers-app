/**
 * Header Extraction Utilities
 *
 * Extracts HTTP response headers from a Source object.
 *
 * Extraction Strategy Hierarchy:
 * 1. Direct responseHeaders field (populated by refresh/fetch pipeline)
 * 2. Original response JSON parsing (for proxy-style responses with embedded headers)
 * 3. Source content JSON parsing
 * 4. Regex-based extraction for malformed JSON
 * 5. Content-type fallback detection
 *
 * @module HeaderExtractor
 * @since 3.0.0
 */

import type { Source } from '../../../../types/source';

/**
 * Extracts HTTP response headers from a Source object.
 *
 * Uses a fallback hierarchy: first checks the dedicated responseHeaders field,
 * then attempts to parse headers from originalResponse or sourceContent.
 *
 * @param source - Source object containing response data
 * @returns Extracted headers object or null if extraction fails
 */
export function extractHeaders(source: Source | null): Record<string, string> | null {
  // Check if responseHeaders was explicitly cleared (null means error state)
  if (source?.responseHeaders === null) {
    return null;
  }

  // Primary path: use stored response headers from the fetch pipeline
  if (source?.responseHeaders && Object.keys(source.responseHeaders).length > 0) {
    return source.responseHeaders;
  }

  // Fallback: try to parse headers from originalResponse (body before filtering)
  // This works for proxy-style APIs that embed headers in the response body
  if (source?.originalResponse && typeof source.originalResponse === 'string') {
    const originalHeaders = extractFromJsonString(source.originalResponse);
    if (originalHeaders) return originalHeaders;
  }

  // Fallback: check for headers embedded in source content
  if (source?.sourceContent && typeof source.sourceContent === 'string') {
    const contentHeaders = extractFromSourceContent(source.sourceContent);
    if (contentHeaders) return contentHeaders;
  }

  // Last resort: content-type sniffing
  const fallbackHeaders = generateFallbackHeaders(source);
  if (Object.keys(fallbackHeaders).length > 0) {
    return fallbackHeaders;
  }

  return null;
}

/**
 * Attempts to parse a JSON string and extract a "headers" property from it
 */
function extractFromJsonString(jsonString: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed?.headers && typeof parsed.headers === 'object') {
      return parsed.headers;
    }
  } catch {
    // Not valid JSON, try regex
  }

  return extractHeadersWithRegex(jsonString);
}

/**
 * Extracts headers from source content string
 */
function extractFromSourceContent(sourceContent: string): Record<string, string> | null {
  if (sourceContent.includes('"headers":')) {
    const regexHeaders = extractHeadersWithRegex(sourceContent);
    if (regexHeaders) return regexHeaders;
  }

  // Try aggressive extraction for malformed JSON
  return extractHeadersAggressive(sourceContent);
}

/**
 * Extracts headers using regex pattern matching
 */
function extractHeadersWithRegex(content: string): Record<string, string> | null {
  try {
    const headerPattern = /"headers":\s*(\{[^}]+})/;
    const match = content.match(headerPattern);

    if (match?.[1]) {
      try {
        const headersText = match[1].replace(/\\"/g, '"').replace(/([{,])\s*([a-zA-Z0-9_-]+):/g, '$1"$2":');

        return JSON.parse(headersText);
      } catch {
        // Failed to parse headers from regex match
      }
    }
  } catch {
    // Regex extraction approach failed
  }
  return null;
}

/**
 * Aggressive header extraction for malformed JSON
 */
function extractHeadersAggressive(content: string): Record<string, string> | null {
  try {
    const fullResponseMatch = content.match(/\{[\s\S]*?"headers"[\s\S]*?}/);
    if (fullResponseMatch) {
      try {
        const fullResponse = JSON.parse(fullResponseMatch[0]);
        if (fullResponse.headers) {
          return fullResponse.headers;
        }
      } catch {
        // Failed to parse full response match
      }
    }
  } catch {
    // Failed aggressive extraction approach
  }
  return null;
}

/**
 * Generates fallback headers based on content analysis
 */
function generateFallbackHeaders(source: Source | null): Record<string, string> {
  const fallbackHeaders: Record<string, string> = {};

  if (
    source?.sourceContent?.includes('<!doctype html>') ||
    (typeof source?.originalResponse === 'string' && source.originalResponse.includes('<!doctype html>'))
  ) {
    fallbackHeaders['Content-Type'] = 'text/html';
  }

  return fallbackHeaders;
}
