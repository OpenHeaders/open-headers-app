/**
 * Proxy Components Package Index
 *
 * Central export point for the fully modular proxy components package.
 * Provides a clean API for consuming proxy functionality throughout the application.
 *
 * Package Structure:
 * - components/: Modular UI components with fine-grained sub-components
 *   - ProxyServerControls: Server start/stop and configuration
 *   - ProxyRulesSection: Complete rule management section
 *   - ProxyCacheSection: Cache management and statistics
 *   - ProxyRuleFormModular: Modular form built from field components
 *   - ProxyRuleTableModular: Modular table built from column components
 *   - Form field components: Individual form input components
 *   - Table components: Column definitions and empty state
 * - hooks/: Custom hooks for business logic (useProxyServer)
 * - utils/: Utility functions (sourceUtils, formatUtils)
 * - ProxyServer: Main orchestrating component
 */

// All modular components
export * from './components';
// Custom hooks
export * from './hooks';
// Main component (primary export)
// Default export for convenience
export { default } from './ProxyServer';
// Utilities
export * from './utils';
