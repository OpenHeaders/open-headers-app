/**
 * Rules domain types.
 *
 * Rules define how the proxy/extension modifies HTTP traffic.
 * Three rule types: header, payload, and URL.
 */

// ── Enums / literals ────────────────────────────────────────────────

export type RuleType = 'header' | 'payload' | 'url';

export type MatchType = 'contains' | 'regex' | 'exact';

export type ContentType = 'any' | 'json' | 'xml' | 'text' | 'form';

export type UrlRuleAction = 'modify' | 'redirect' | 'block';

// ── Base rule ───────────────────────────────────────────────────────

export interface BaseRule {
  id: string;
  type: RuleType;
  name: string;
  description: string;
  isEnabled: boolean;
  domains: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Header rule ─────────────────────────────────────────────────────

export interface HeaderRule extends BaseRule {
  type: 'header';
  headerName: string;
  headerValue: string;
  tag: string;
  isResponse: boolean;
  isDynamic: boolean;
  sourceId: string | number | null;
  prefix: string;
  suffix: string;
  hasEnvVars: boolean;
  envVars: string[];
}

// ── Payload rule ────────────────────────────────────────────────────

export interface PayloadRule extends BaseRule {
  type: 'payload';
  matchPattern: string;
  matchType: MatchType;
  replaceWith: string;
  isRequest: boolean;
  isResponse: boolean;
  contentType: ContentType;
}

// ── URL rule ────────────────────────────────────────────────────────

export interface UrlParamModification {
  key: string;
  value?: string;
  action?: string;
}

export interface UrlRule extends BaseRule {
  type: 'url';
  matchPattern: string;
  matchType: MatchType;
  replacePattern: string;
  redirectTo: string;
  modifyParams: UrlParamModification[];
  action: UrlRuleAction;
}

// ── Union ───────────────────────────────────────────────────────────

export type Rule = HeaderRule | PayloadRule | UrlRule;

// ── Persisted file shape (rules.json) ───────────────────────────────

export interface RulesStorage {
  version: string;
  rules: {
    header: HeaderRule[];
    request: PayloadRule[];
    response: Rule[];
  };
  metadata: {
    lastUpdated: string;
    totalRules: number;
  };
}

// ── Validation result ───────────────────────────────────────────────

export interface RuleValidation {
  valid: boolean;
  error?: string;
}
