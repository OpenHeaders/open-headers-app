/**
 * Utility functions for environment variable operations
 */

import { VARIABLE_TEMPLATE_REGEX } from './EnvironmentTypes';
import { showMessage } from '../../../utils/ui/messageUtil';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('EnvironmentUtils');

/**
 * Extracts all variable references from a text string
 * @param {string} text - Text to search for variables
 * @returns {string[]} Array of variable names found
 */
export const extractVariables = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const matches = text.match(VARIABLE_TEMPLATE_REGEX) || [];
  return matches.map(match => match.slice(2, -2)); // Remove {{ and }}
};

/**
 * Checks for missing variables in a target environment
 * @param {Object} sources - Array of source configurations
 * @param {Object} targetEnvironment - Target environment variables
 * @param {Object} rules - Rules object containing header rules
 * @returns {string[]} Array of missing variable names
 */
export const checkMissingVariables = (sources, targetEnvironment, rules = null) => {
  const missingVars = new Set();
  
  if (!sources || !Array.isArray(sources)) {
    log.warn('Invalid sources provided to checkMissingVariables');
    return [];
  }

  sources.forEach(source => {
    if (source.sourceType === 'http') {
      // Check URL for variables
      const urlVars = extractVariables(source.sourcePath || '');
      urlVars.forEach(varName => {
        if (!targetEnvironment[varName]) {
          missingVars.add(varName);
        }
      });
      
      // Check headers
      if (source.requestOptions?.headers) {
        source.requestOptions.headers.forEach(header => {
          const headerVars = extractVariables(header.value || '');
          headerVars.forEach(varName => {
            if (!targetEnvironment[varName]) {
              missingVars.add(varName);
            }
          });
        });
      }
      
      // Check body, totpSecret, and other fields
      ['body', 'totpSecret'].forEach(field => {
        if (source.requestOptions?.[field]) {
          const fieldVars = extractVariables(source.requestOptions[field] || '');
          fieldVars.forEach(varName => {
            if (!targetEnvironment[varName]) {
              missingVars.add(varName);
            }
          });
        }
      });
      
      // Check query parameters
      if (source.requestOptions?.queryParams) {
        source.requestOptions.queryParams.forEach(param => {
          const paramVars = extractVariables(param.value || '');
          paramVars.forEach(varName => {
            if (!targetEnvironment[varName]) {
              missingVars.add(varName);
            }
          });
        });
      }
      
      // Check JSON filter path
      if (source.jsonFilter?.enabled && source.jsonFilter?.path) {
        const filterVars = extractVariables(source.jsonFilter.path || '');
        filterVars.forEach(varName => {
          if (!targetEnvironment[varName]) {
            missingVars.add(varName);
          }
        });
      }
    }
  });
  
  // Check header rules for environment variables
  if (rules && rules.header && Array.isArray(rules.header)) {
    rules.header.forEach(rule => {
      if (rule.hasEnvVars && rule.envVars && Array.isArray(rule.envVars)) {
        rule.envVars.forEach(varName => {
          if (!targetEnvironment[varName]) {
            missingVars.add(varName);
          }
        });
      }
    });
  }
  
  return Array.from(missingVars);
};

/**
 * Generates a unique environment name based on an existing name
 * @param {string} baseName - Base name for the new environment
 * @param {Object} existingEnvironments - Existing environments object
 * @returns {string} Unique environment name
 */
export const generateUniqueEnvironmentName = (baseName, existingEnvironments) => {
  let newName = `${baseName}-copy`;
  let counter = 1;
  
  while (existingEnvironments[newName]) {
    newName = `${baseName}-copy-${counter}`;
    counter++;
  }
  
  return newName;
};

/**
 * Checks if a source uses environment variables
 * @param {Object} source - Source configuration object
 * @returns {boolean} True if source uses variables
 */
export const sourceUsesVariables = (source) => {
  if (!source) return false;
  
  const sourceStr = JSON.stringify(source);
  return sourceStr.includes('{{') && sourceStr.includes('}}');
};

/**
 * Gets sources that use environment variables
 * @param {Array} sources - Array of source configurations
 * @returns {Array} Filtered array of sources using variables
 */
export const getSourcesUsingVariables = (sources) => {
  if (!sources || !Array.isArray(sources)) return [];
  
  return sources.filter(sourceUsesVariables);
};

/**
 * Formats variable usage information for display
 * @param {string} varName - Variable name
 * @param {Array} sourceIds - Array of source IDs using this variable
 * @param {Array} sources - Array of all sources for name lookup
 * @param {Object} rules - Rules object for rule name lookup
 * @returns {Array} Array of formatted source info
 */
export const formatVariableUsage = (varName, sourceIds, sources, rules = null) => {
  if (!sourceIds || !Array.isArray(sourceIds)) return [];
  
  return sourceIds.map(sourceId => {
    // Check if this is a rule identifier
    if (sourceId.startsWith('rule-')) {
      const ruleId = sourceId.substring(5); // Remove 'rule-' prefix
      let ruleName = `Rule #${ruleId}`;
      
      // Try to find the actual rule to get its name
      if (rules && rules.header) {
        const rule = rules.header.find(r => r.id === ruleId);
        if (rule) {
          ruleName = rule.headerName || `Header Rule #${ruleId}`;
        }
      }
      
      return {
        sourceId: sourceId,
        sourceName: ruleName,
        isRule: true
      };
    }
    
    // Regular source
    const source = sources.find(s => s.sourceId === sourceId);
    return {
      sourceId,
      sourceName: source?.sourceName || source?.name || `Source ${sourceId}`,
      isRule: false
    };
  });
};