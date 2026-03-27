/**
 * Proxy Components Index
 * 
 * Central export point for all modular proxy components organized by functionality.
 * Components are now logically grouped into sections, forms, and tables subdirectories.
 * 
 * Structure:
 * - sections/: Main UI sections (server controls, rules, cache)
 * - forms/: Form components and utilities
 * - tables/: Table components and utilities
 */

// Section components
export * from './sections';

// Form components  
export * from './forms';

// Table components
export * from './tables';

// Convenience re-exports for backward compatibility
export { 
    ProxyServerControls,
    ProxyRulesSection, 
    ProxyCacheSection
} from './sections';

export {
    ProxyRuleFormModular,
    HeaderTypeSelector,
    ExistingHeaderRuleSelector,
    CustomHeaderConfig,
    StaticValueInput,
    DynamicValueConfig,
    DomainConfig
} from './forms';

export {
    ProxyRuleTableModular,
    createAllColumns,
    ProxyRuleTableEmpty
} from './tables';