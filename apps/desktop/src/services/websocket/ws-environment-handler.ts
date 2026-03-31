/**
 * WebSocket Environment Handler
 * Manages environment variable resolution and template substitution.
 *
 * Variables are always provided via setVariables() by WorkspaceStateService
 * during initialization and on every environment change. There is no disk
 * fallback — the main process is the single owner of environment state.
 *
 * All consumers (SourceDependencyEvaluator, SourceFetcher, ws-rule-handler) call
 * loadEnvironmentVariables(), which returns the in-memory cache.
 */

import mainLogger from '@/utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('WSEnvironmentHandler');

class WSEnvironmentHandler {
  /** In-memory variable cache. Set by WorkspaceStateService via setVariables()
   *  during init and on every environment change. */
  private variableCache: Record<string, string> | null = null;

  /**
   * Update the in-memory variable cache. Called by WorkspaceStateService when
   * environment variables change (init, switch, edit, import). All subsequent calls
   * to loadEnvironmentVariables() return this cache until cleared.
   */
  setVariables(variables: Record<string, string>): void {
    this.variableCache = variables;
  }

  /**
   * Clear the in-memory cache. Called on workspace switch before new
   * variables are loaded via setVariables().
   */
  clearVariableCache(): void {
    this.variableCache = null;
  }

  /**
   * Load environment variables from the in-memory cache.
   * Returns empty object if cache is not yet populated (pre-init).
   */
  loadEnvironmentVariables(): Record<string, string> {
    if (this.variableCache) {
      return this.variableCache;
    }

    log.debug('Environment variable cache empty — WorkspaceStateService has not populated it yet');
    return {};
  }

  /**
   * Resolve template with environment variables
   */
  resolveTemplate(template: string, variables: Record<string, string>): string {
    if (!template) {
      return template;
    }

    return template.replace(/\{\{([^}]+)}}/g, (match: string, varName: string) => {
      const trimmedVarName = varName.trim();
      const value = variables[trimmedVarName];

      if (value !== undefined && value !== null && value !== '') {
        return value;
      }

      return match;
    });
  }
}

export { WSEnvironmentHandler };
