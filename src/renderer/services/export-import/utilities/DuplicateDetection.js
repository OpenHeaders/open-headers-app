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
export function isSourceDuplicate(source, currentSources) {
  if (!source || !Array.isArray(currentSources)) {
    return false;
  }

  return currentSources.some(existingSource => {
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
export function isProxyRuleDuplicate(rule, existingRules) {
  if (!rule || !Array.isArray(existingRules)) {
    return false;
  }

  return existingRules.some(existingRule => {
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
    return rule.headers.every(importHeader => {
      return existingRule.headers.some(existingHeader => {
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
export function areHeadersEqual(header1, header2) {
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
export function isRuleDuplicate(rule, existingRules) {
  if (!rule || !Array.isArray(existingRules)) {
    return false;
  }

  // Use rule ID as primary duplicate detection method
  if (rule.id) {
    return existingRules.some(existingRule => existingRule.id === rule.id);
  }

  // Fallback to content-based duplicate detection
  return existingRules.some(existingRule => {
    return areRulesContentEqual(rule, existingRule);
  });
}

/**
 * Compares two rules for content equality
 * @param {Object} rule1 - First rule to compare
 * @param {Object} rule2 - Second rule to compare
 * @returns {boolean} - True if rules have same content
 */
export function areRulesContentEqual(rule1, rule2) {
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
export function areHeaderModificationsEqual(headers1, headers2) {
  if (!Array.isArray(headers1) || !Array.isArray(headers2)) {
    return headers1 === headers2;
  }

  if (headers1.length !== headers2.length) {
    return false;
  }

  // Sort headers by name for comparison
  const sorted1 = [...headers1].sort((a, b) => a.name.localeCompare(b.name));
  const sorted2 = [...headers2].sort((a, b) => a.name.localeCompare(b.name));

  return sorted1.every((header1, index) => {
    const header2 = sorted2[index];
    return areHeadersEqual(header1, header2);
  });
}

/**
 * Checks if an environment variable already exists
 * @param {string} varName - Variable name
 * @param {string} envName - Environment name
 * @param {Object} environments - Current environments object
 * @returns {boolean} - True if variable already exists
 */
export function isEnvironmentVariableDuplicate(varName, envName, environments) {
  if (!varName || !envName || !environments) {
    return false;
  }

  return environments[envName] && environments[envName][varName] !== undefined;
}

/**
 * Checks if a workspace name already exists
 * @param {string} workspaceName - Workspace name to check
 * @param {Array} existingWorkspaces - Array of existing workspaces
 * @returns {boolean} - True if workspace name is a duplicate
 */
export function isWorkspaceNameDuplicate(workspaceName, existingWorkspaces) {
  if (!workspaceName || !Array.isArray(existingWorkspaces)) {
    return false;
  }

  return existingWorkspaces.some(workspace => workspace.name === workspaceName);
}

/**
 * Generates a unique name by appending a suffix
 * @param {string} baseName - Original name
 * @param {Array} existingNames - Array of existing names to avoid
 * @param {string} suffix - Suffix to append (default: 'Copy')
 * @returns {string} - Unique name
 */
export function generateUniqueName(baseName, existingNames, suffix = 'Copy') {
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
export function createDuplicateDetector(dataType) {
  switch (dataType) {
    case 'sources':
      return (item, existingItems) => isSourceDuplicate(item, existingItems);
    case 'proxyRules':
      return (item, existingItems) => isProxyRuleDuplicate(item, existingItems);
    case 'rules':
      return (item, existingItems) => isRuleDuplicate(item, existingItems);
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
export async function batchDuplicateDetection(itemsToImport, existingItems, duplicateDetector, batchSize = 50) {
  const results = [];

  for (let i = 0; i < itemsToImport.length; i += batchSize) {
    const batch = itemsToImport.slice(i, i + batchSize);
    
    const batchResults = batch.map(item => ({
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