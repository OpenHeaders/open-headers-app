/**
 * URL Utilities — single owner of all URL pattern logic.
 *
 * Two responsibilities:
 * 1. formatUrlPattern() — converts a domain pattern into the canonical MV3
 *    declarativeNetRequest urlFilter string. Used by header-manager.ts.
 * 2. doesUrlMatchPattern() — replicates urlFilter matching semantics in-memory
 *    via compiled RegExp. Used by request-tracker.ts (badge, Active tab).
 *
 * Both functions share the same normalization path so they always agree
 * on whether a URL matches a pattern.
 */

// ── Pre-compiled pattern cache ─────────────────────────────────────
// Key: raw pattern string → Value: compiled RegExp (or null for '*')
const compiledPatternCache = new Map<string, RegExp | null>();

/**
 * Clear pattern caches — call when rules change
 */
export function clearPatternCache(): void {
  compiledPatternCache.clear();
}

/**
 * Pre-compile a pattern and store it in the cache.
 * Call this when rules are loaded to avoid regex compilation in hot paths.
 */
export function precompilePattern(pattern: string): void {
  if (compiledPatternCache.has(pattern)) return;
  compileAndCachePattern(pattern);
}

/**
 * Pre-compile all domain patterns from all entries at once
 */
export function precompileAllPatterns(domains: string[]): void {
  for (const domain of domains) {
    if (!compiledPatternCache.has(domain)) {
      compileAndCachePattern(domain);
    }
  }
}

/**
 * Convert a user-entered domain pattern into a MV3 declarativeNetRequest
 * urlFilter string. This is the single normalization function — both
 * declarativeNetRequest rules and the in-memory regex matcher use it.
 *
 * Supported inputs:
 *   "example.com"                → "*://example.com/*"
 *   "*.example.com"              → "*://*.example.com/*"
 *   "example.com/api"            → "*://example.com/api"
 *   "example.com/api/*"          → "*://example.com/api/*"
 *   "localhost:3000"             → "*://localhost:3000/*"
 *   "192.168.1.1:8080"          → "*://192.168.1.1:8080/*"
 *   "https://example.com/*"     → "https://example.com/*"
 *   "*"                         → "*"
 */
export function formatUrlPattern(domain: string): string {
  let urlFilter = domain.trim();

  if (urlFilter === '*') return '*';

  // If pattern already has a protocol, just ensure it has a path
  if (urlFilter.includes('://')) {
    const protocolEnd = urlFilter.indexOf('://') + 3;
    const afterProtocol = urlFilter.substring(protocolEnd);
    if (!afterProtocol.includes('/')) {
      urlFilter = `${urlFilter}/*`;
    }
    return urlFilter;
  }

  // Add wildcard protocol
  urlFilter = `*://${urlFilter}`;

  // Ensure pattern has a path — bare hostnames get /*
  const protocolEnd = urlFilter.indexOf('://') + 3;
  const afterProtocol = urlFilter.substring(protocolEnd);
  if (!afterProtocol.includes('/')) {
    urlFilter = `${urlFilter}/*`;
  }

  return urlFilter;
}

/**
 * Internal: compile a pattern into a RegExp that replicates MV3 urlFilter
 * matching semantics.
 *
 * Key difference from exact regex: urlFilter does NOT anchor at the end.
 * "*://example.com/api" matches "https://example.com/api/v2/users"
 * because Chrome treats urlFilter as a prefix/substring match.
 */
function compileAndCachePattern(pattern: string): void {
  const trimmed = pattern.trim().toLowerCase();

  // Wildcard matches everything
  if (trimmed === '*') {
    compiledPatternCache.set(pattern, null); // null = match-all sentinel
    return;
  }

  // Normalize through the same function used for declarativeNetRequest
  let urlFilter = formatUrlPattern(trimmed);

  // Handle IDN in patterns
  try {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — detecting non-ASCII for IDN normalization
    if (/[^\x00-\x7F]/.test(urlFilter)) {
      const patternUrl = new URL(urlFilter.replace('*://', 'http://'));
      urlFilter = formatUrlPattern(patternUrl.hostname.toLowerCase());
    }
  } catch (_e) {
    // Pattern is not a valid URL, continue with original
  }

  // Normalize default ports
  urlFilter = urlFilter.replace(/:80\//, '/').replace(/:443\//, '/');

  // Convert urlFilter to regex:
  // 1. Escape special regex chars (except *)
  // 2. Replace * with .*
  // 3. Anchor at start only (^) — no end anchor ($)
  //    This replicates urlFilter semantics where the pattern
  //    matches if the URL starts with the expanded pattern.
  const regexPattern = urlFilter
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}`, 'i');
  compiledPatternCache.set(pattern, regex);
}

/**
 * Normalize a URL for consistent tracking
 * Removes fragments, normalizes case, handles IDN domains
 */
export function normalizeUrlForTracking(url: string): string {
  try {
    const urlObj = new URL(url);

    // Remove fragment
    urlObj.hash = '';

    // Normalize hostname to lowercase
    urlObj.hostname = urlObj.hostname.toLowerCase();

    // Remove default ports
    if (
      (urlObj.protocol === 'http:' && urlObj.port === '80') ||
      (urlObj.protocol === 'https:' && urlObj.port === '443')
    ) {
      urlObj.port = '';
    }

    // Remove trailing slash from pathname if it's just /
    if (urlObj.pathname === '/') {
      urlObj.pathname = '';
    }

    return urlObj.toString();
  } catch (_e) {
    // If URL parsing fails, return original
    return url.toLowerCase();
  }
}

// Non-trackable schemes as a Set for O(1) prefix checks
const NON_TRACKABLE_SCHEMES: readonly string[] = [
  'about:',
  'chrome:',
  'chrome-extension:',
  'edge:',
  'extension:',
  'moz-extension:',
  'opera:',
  'vivaldi:',
  'brave:',
  'data:',
  'blob:',
  'javascript:',
  'view-source:',
  'ws:',
  'wss:',
  'ftp:',
  'sftp:',
  'chrome-devtools:',
  'devtools:',
];

/**
 * Check if a URL should be tracked at all
 */
export function isTrackableUrl(url: string): boolean {
  if (!url) return false;

  const lowerUrl = url.toLowerCase();
  for (const scheme of NON_TRACKABLE_SCHEMES) {
    if (lowerUrl.startsWith(scheme)) {
      return false;
    }
  }

  return true;
}

/**
 * URL pattern matching using pre-compiled regex cache.
 * Replicates MV3 declarativeNetRequest urlFilter semantics.
 */
export function doesUrlMatchPattern(url: string, pattern: string): boolean {
  try {
    const normalizedUrl = normalizeUrlForTracking(url);

    let cached = compiledPatternCache.get(pattern);

    if (cached === undefined) {
      // Pattern not pre-compiled — compile now and cache
      compileAndCachePattern(pattern);
      cached = compiledPatternCache.get(pattern);
      // If compilation still didn't produce a result, bail out
      if (cached === undefined) return false;
    }

    // null sentinel means match-all ('*')
    if (cached === null) return true;

    // Fast path: if the pattern is a simple exact domain (no wildcards, no path,
    // no protocol), try direct hostname:port comparison.
    const trimmedPattern = pattern.trim().toLowerCase();
    if (!trimmedPattern.includes('*') && !trimmedPattern.includes('/') && !trimmedPattern.includes('://')) {
      try {
        const urlObj = new URL(normalizedUrl);
        const portSuffix = urlObj.port ? `:${urlObj.port}` : '';
        const hostWithPort = urlObj.hostname + portSuffix;
        // Strict match: "localhost:3000" must match "localhost:3000",
        // bare "localhost" must match "localhost" (no port in URL).
        // This prevents bare "localhost" from matching "localhost:3000".
        if (hostWithPort === trimmedPattern) {
          return true;
        }
        // Fall through to regex — don't short-circuit with hostname-only
        // comparison, because pattern "localhost" compiled to
        // *://localhost/* which does NOT match http://localhost:3000/...
      } catch (_e) {
        // fall through to regex
      }
    }

    return cached.test(normalizedUrl);
  } catch (_e) {
    return false;
  }
}
