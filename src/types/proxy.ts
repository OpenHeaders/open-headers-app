/**
 * Proxy domain types.
 *
 * Types for the local HTTP proxy server, its rules, cache, and status.
 */

// ── Proxy rule (proxy-rules.json) ───────────────────────────────────

export interface ProxyRule {
  id: string;
  name?: string;
  enabled?: boolean;
  headerRuleId?: string;
  isDynamic?: boolean;
  headerName?: string;
  headerValue?: string;
  sourceId?: string | number;
  prefix?: string;
  suffix?: string;
  domains?: string[];
  hasEnvVars?: boolean;
}

// ── Proxy stats & status ────────────────────────────────────────────

export interface ProxyStats {
  requestsProcessed: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  rulesCount: number;
  sourcesCount: number;
  cacheEnabled: boolean;
  cacheSize: number;
  stats: ProxyStats;
  strictSSL: boolean;
  trustedCertificates: number;
  certificateExceptions: number;
}

// ── Proxy certificate info ──────────────────────────────────────────

export interface ProxyCertificateInfo {
  strictSSL: boolean;
  trustedCertificates: string[];
  certificateExceptions: Array<{ domain: string; fingerprint: string }>;
}
