/**
 * Unified Rules Structure
 * 
 * This defines the structure for all rule types in the application.
 * Each rule type has its own properties but shares common fields.
 */

// Rule types enum
export const RULE_TYPES = {
    HEADER: 'header',
    PAYLOAD: 'payload',
    URL: 'url'
};

// Common rule structure
export const createRule = (type, data = {}) => {
    const baseRule = {
        id: data.id || Date.now().toString(),
        type: type,
        name: data.name || '',
        description: data.description || '',
        isEnabled: data.isEnabled !== false,
        domains: data.domains || [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
    };

    // Add type-specific fields
    switch (type) {
        case RULE_TYPES.HEADER:
            return {
                ...baseRule,
                headerName: data.headerName || '',
                headerValue: data.headerValue || '',
                tag: data.tag || '',
                isResponse: data.isResponse || false,
                isDynamic: data.isDynamic || false,
                sourceId: data.sourceId || null,
                prefix: data.prefix || '',
                suffix: data.suffix || '',
                hasEnvVars: data.hasEnvVars || false,
                envVars: data.envVars || []
            };

        case RULE_TYPES.PAYLOAD:
            return {
                ...baseRule,
                matchPattern: data.matchPattern || '',
                matchType: data.matchType || 'contains', // contains, regex, exact
                replaceWith: data.replaceWith || '',
                isRequest: data.isRequest !== false,
                isResponse: data.isResponse !== false,
                contentType: data.contentType || 'any' // any, json, xml, text, form
            };

        case RULE_TYPES.URL:
            return {
                ...baseRule,
                matchPattern: data.matchPattern || '',
                matchType: data.matchType || 'contains', // contains, regex, exact
                replacePattern: data.replacePattern || '',
                redirectTo: data.redirectTo || '',
                modifyParams: data.modifyParams || [],
                action: data.action || 'modify' // modify, redirect, block
            };

        default:
            throw new Error(`Unknown rule type: ${type}`);
    }
};

// Storage structure for all rules
export const createRulesStorage = () => ({
    version: '3.0.0',
    rules: {
        [RULE_TYPES.HEADER]: [],
        [RULE_TYPES.PAYLOAD]: [],
        [RULE_TYPES.URL]: []
    },
    metadata: {
        lastUpdated: new Date().toISOString(),
        totalRules: 0
    }
});


// Export rules in a format compatible with browser extension
export const exportForExtension = (storage) => {
    return {
        version: storage.version,
        rules: storage.rules,
        metadata: storage.metadata
    };
};

// WebSocket message types for rules
export const RULE_MESSAGE_TYPES = {
    // Generic rule operations
    RULES_REQUEST: 'rulesRequest',
    RULES_UPDATE: 'rulesUpdate',
    RULE_TOGGLE: 'ruleToggle',
    RULE_CREATE: 'ruleCreate',
    RULE_DELETE: 'ruleDelete',
    RULE_MODIFY: 'ruleModify',
    
};

// Validate rule based on type
export const validateRule = (rule) => {
    if (!rule.type || !Object.values(RULE_TYPES).includes(rule.type)) {
        return { valid: false, error: 'Invalid rule type' };
    }
    
    if (!rule.domains || rule.domains.length === 0) {
        return { valid: false, error: 'At least one domain is required' };
    }
    
    switch (rule.type) {
        case RULE_TYPES.HEADER:
            if (!rule.headerName) {
                return { valid: false, error: 'Header name is required' };
            }
            if (!rule.isDynamic && !rule.headerValue) {
                return { valid: false, error: 'Header value is required for static headers' };
            }
            if (rule.isDynamic && !rule.sourceId) {
                return { valid: false, error: 'Source is required for dynamic headers' };
            }
            break;
            
        case RULE_TYPES.PAYLOAD:
            if (!rule.matchPattern) {
                return { valid: false, error: 'Match pattern is required' };
            }
            if (!rule.replaceWith && rule.replaceWith !== '') {
                return { valid: false, error: 'Replace value is required' };
            }
            break;
            
        case RULE_TYPES.URL:
            if (!rule.matchPattern) {
                return { valid: false, error: 'URL pattern is required' };
            }
            if (rule.action === 'redirect' && !rule.redirectTo) {
                return { valid: false, error: 'Redirect URL is required' };
            }
            break;
    }
    
    return { valid: true };
};