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

// Form components
export * from './forms';
export {
  CustomHeaderConfig,
  DomainConfig,
  DynamicValueConfig,
  ExistingHeaderRuleSelector,
  HeaderTypeSelector,
  ProxyRuleFormModular,
  StaticValueInput,
} from './forms';
// Section components
export * from './sections';

// Convenience re-exports for backward compatibility
export {
  ProxyCacheSection,
  ProxyRulesSection,
  ProxyServerControls,
} from './sections';
// Table components
export * from './tables';

export {
  createAllColumns,
  ProxyRuleTableEmpty,
  ProxyRuleTableModular,
} from './tables';
