/**
 * Duplicate Detection Utilities for Export/Import Operations
 * 
 * This module provides comprehensive duplicate detection algorithms for different data types
 * during import operations. It handles complex comparison logic for sources, proxy rules,
 * application rules, environment variables, and workspace configurations.
 * 
 * Key features:
 * - Content-based duplicate detection (not just ID-based)
 * - Type-specific comparison algorithms
 * - Batch processing for large datasets
 * - Configurable duplicate detection strategies
 */

interface ImportSource {
  sourceType: string;
  sourcePath?: string;
  url?: string;
}

interface ImportHeader {
  name: string;
  value?: string;
  isDynamic?: boolean;
  sourceId?: string;
  prefix?: string;
  suffix?: string;
}

interface ImportProxyRule {
  pattern?: string;
  headers?: ImportHeader[];
}

interface ImportRule {
  id?: string;
  name?: string;
  enabled?: boolean;
  pattern?: string;
  action?: string;
  headers?: ImportHeader[];
  payload?: string;
  redirectUrl?: string;
}

interface EnvironmentCollection {
  [envName: string]: {
    [varName: string]: string | { value?: string | null } | undefined;
  };
}

interface Workspace {
  name: string;
}

/**
 * Checks if a source already exists in the current sources list
 * 
 * Sources are considered duplicates if they have the same type, name, and 
 * type-specific identifying property (filePath for files, varName for env vars, url for http).
 * 
 * @param {Object} source - Source to check for duplicates
 * @param {Array} currentSources - Array of existing sources
 * @returns {boolean} - True if source is a duplicate
 */
export function isSourceDuplicate(source: ImportSource | null, currentSources: ImportSource[]) {
  if (!source || !Array.isArray(currentSources)) {
    return false;
  }

  return currentSources.some((existingSource: ImportSource) => {
    // Sources are considered duplicates if they have the same type and key identifying property
    if (existingSource.sourceType !== source.sourceType) {
      return false;
    }

    // Check type-specific identifying properties
    switch (source.sourceType) {
      case 'file':
        return existingSource.sourcePath === source.sourcePath;
      case 'env':
        return existingSource.sourcePath === source.sourcePath;
      case 'http':
        return existingSource.url === source.url && existingSource.sourcePath === source.sourcePath;
      default:
        // For unknown types, only match on type and path
        return existingSource.sourcePath === source.sourcePath;
    }
  });
}

/**
 * Checks if a proxy rule already exists
 * 
 * Proxy rules are considered duplicates if they have the same URL pattern
 * and identical header configurations (including dynamic headers).
 * 
 * @param {Object} rule - Proxy rule to check
 * @param {Array} existingRules - Array of existing proxy rules
 * @returns {boolean} - True if rule is a duplicate
 */
export function isProxyRuleDuplicate(rule: ImportProxyRule | null, existingRules: ImportProxyRule[]) {
  if (!rule || !Array.isArray(existingRules)) {
    return false;
  }

  return existingRules.some((existingRule: ImportProxyRule) => {
    // First check if URL patterns match
    if (existingRule.pattern !== rule.pattern) {
      return false;
    }

    // Check if both rules have headers
    if (!existingRule.headers || !rule.headers) {
      return !existingRule.headers && !rule.headers; // Both must be falsy to be considered same
    }

    // Check if header arrays have same length
    if (existingRule.headers.length !== rule.headers.length) {
      return false;
    }

    // Check each header for match
    return rule.headers.every((importHeader: ImportHeader) => {
      return existingRule.headers!.some((existingHeader: ImportHeader) => {
        return areHeadersEqual(existingHeader, importHeader);
      });
    });
  });
}

/**
 * Compares two header objects for equality
 * @param {Object} header1 - First header to compare
 * @param {Object} header2 - Second header to compare
 * @returns {boolean} - True if headers are equal
 */
export function areHeadersEqual(header1: ImportHeader, header2: ImportHeader) {
  // Check header name
  if (header1.name !== header2.name) {
    return false;
  }

  // Check if both are same type (static vs dynamic)
  if (header1.isDynamic !== header2.isDynamic) {
    return false;
  }

  // For static headers, compare values
  if (!header2.isDynamic) {
    return header1.value === header2.value;
  }

  // For dynamic headers, compare source configuration
  return header1.sourceId === header2.sourceId &&
         (header1.prefix || '') === (header2.prefix || '') &&
         (header1.suffix || '') === (header2.suffix || '');
}

/**
 * Checks if a rule already exists in a rules collection
 * 
 * Rules are first checked by ID for exact matches, then by content comparison
 * for rules without IDs. Content comparison varies by rule action type.
 * 
 * @param {Object} rule - Rule to check
 * @param {Array} existingRules - Array of existing rules of the same type
 * @returns {boolean} - True if rule is a duplicate
 */
export function isRuleDuplicate(rule: ImportRule | null, existingRules: ImportRule[]) {
  if (!rule || !Array.isArray(existingRules)) {
    return false;
  }

  // Use rule ID as primary duplicate detection method
  if (rule.id) {
    return existingRules.some((existingRule: ImportRule) => existingRule.id === rule.id);
  }

  // Fallback to content-based duplicate detection
  return existingRules.some((existingRule: ImportRule) => {
    return areRulesContentEqual(rule, existingRule);
  });
}

/**
 * Compares two rules for content equality
 * @param {Object} rule1 - First rule to compare
 * @param {Object} rule2 - Second rule to compare
 * @returns {boolean} - True if rules have same content
 */
export function areRulesContentEqual(rule1: ImportRule, rule2: ImportRule) {
  // Compare basic properties
  const basicPropsEqual = 
    rule1.name === rule2.name &&
    rule1.enabled === rule2.enabled &&
    rule1.pattern === rule2.pattern;

  if (!basicPropsEqual) {
    return false;
  }

  // Compare action-specific properties based on rule type
  if (rule1.action !== rule2.action) {
    return false;
  }

  switch (rule1.action) {
    case 'modify-headers':
      return areHeaderModificationsEqual(rule1.headers, rule2.headers);
    case 'modify-payload':
      return rule1.payload === rule2.payload;
    case 'redirect':
      return rule1.redirectUrl === rule2.redirectUrl;
    case 'block':
      return true; // No additional properties to compare
    default:
      return JSON.stringify(rule1) === JSON.stringify(rule2);
  }
}

/**
 * Compares header modification arrays for equality
 * @param {Array} headers1 - First header array
 * @param {Array} headers2 - Second header array
 * @returns {boolean} - True if header modifications are equal
 */
export function areHeaderModificationsEqual(headers1: ImportHeader[] | undefined, headers2: ImportHeader[] | undefined) {
  if (!Array.isArray(headers1) || !Array.isArray(headers2)) {
    return headers1 === headers2;
  }

  if (headers1.length !== headers2.length) {
    return false;
  }

  // Sort headers by name for comparison
  const sorted1 = [...headers1].sort((a: ImportHeader, b: ImportHeader) => a.name.localeCompare(b.name));
  const sorted2 = [...headers2].sort((a: ImportHeader, b: ImportHeader) => a.name.localeCompare(b.name));

  return sorted1.every((header1: ImportHeader, index: number) => {
    const header2 = sorted2[index];
    return areHeadersEqual(header1, header2);
  });
}

/**
 * Checks if an environment variable already exists with a non-empty value.
 * Variables that exist but have empty values (e.g. from schema imports) are
 * NOT considered duplicates — they are placeholders waiting to be filled.
 * @param {string} varName - Variable name
 * @param {string} envName - Environment name
 * @param {Object} environments - Current environments object
 * @returns {boolean} - True if variable already exists with a non-empty value
 */
export function isEnvironmentVariableDuplicate(varName: string, envName: string, environments: EnvironmentCollection | null) {
  if (!varName || !envName || !environments) {
    return false;
  }

  if (!environments[envName] || environments[envName][varName] === undefined) {
    return false;
  }

  // A variable with an empty value is just a schema placeholder, not a real duplicate
  const existing = environments[envName][varName];
  const existingValue = typeof existing === 'object' ? existing.value : existing;
  return existingValue !== undefined && existingValue !== null && existingValue !== '';
}

/**
 * Checks if a workspace name already exists
 * @param {string} workspaceName - Workspace name to check
 * @param {Array} existingWorkspaces - Array of existing workspaces
 * @returns {boolean} - True if workspace name is a duplicate
 */
export function isWorkspaceNameDuplicate(workspaceName: string, existingWorkspaces: Workspace[]) {
  if (!workspaceName || !Array.isArray(existingWorkspaces)) {
    return false;
  }

  return existingWorkspaces.some((workspace: Workspace) => workspace.name === workspaceName);
}

/**
 * Generates a unique name by appending a suffix
 * @param {string} baseName - Original name
 * @param {Array} existingNames - Array of existing names to avoid
 * @param {string} suffix - Suffix to append (default: 'Copy')
 * @returns {string} - Unique name
 */
export function generateUniqueName(baseName: string, existingNames: string[], suffix: string = 'Copy') {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  let counter = 1;
  let candidateName = `${baseName} (${suffix})`;

  while (existingNames.includes(candidateName)) {
    counter++;
    candidateName = `${baseName} (${suffix} ${counter})`;
  }

  return candidateName;
}


/**
 * Creates a duplicate detection strategy for different data types
 * @param {string} dataType - Type of data ('sources', 'rules', 'proxyRules', etc.)
 * @returns {Function} - Duplicate detection function for the specified type
 */
export function createDuplicateDetector(dataType: string) {
  switch (dataType) {
    case 'sources':
      return (item: ImportSource, existingItems: ImportSource[]) => isSourceDuplicate(item, existingItems);
    case 'proxyRules':
      return (item: ImportProxyRule, existingItems: ImportProxyRule[]) => isProxyRuleDuplicate(item, existingItems);
    case 'rules':
      return (item: ImportRule, existingItems: ImportRule[]) => isRuleDuplicate(item, existingItems);
    default:
      return () => false; // No duplicate detection by default
  }
}

/**
 * Batch duplicate detection for large datasets
 * 
 * Processes items in batches to prevent UI blocking during large import operations.
 * Uses setTimeout(0) to yield control between batches.
 * 
 * @param {Array} itemsToImport - Items to check for duplicates
 * @param {Array} existingItems - Existing items to compare against
 * @param {Function} duplicateDetector - Duplicate detection function
 * @param {number} batchSize - Size of batches to process (default: 50)
 * @returns {Promise<Array>} - Array of duplicate detection results
 */
export async function batchDuplicateDetection<T>(itemsToImport: T[], existingItems: T[], duplicateDetector: (item: T, existing: T[]) => boolean, batchSize: number = 50) {
  const results = [];

  for (let i = 0; i < itemsToImport.length; i += batchSize) {
    const batch = itemsToImport.slice(i, i + batchSize);
    
    const batchResults = batch.map((item: T) => ({
      item,
      isDuplicate: duplicateDetector(item, existingItems)
    }));

    results.push(...batchResults);

    // Yield control to prevent blocking the UI
    if (i + batchSize < itemsToImport.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}