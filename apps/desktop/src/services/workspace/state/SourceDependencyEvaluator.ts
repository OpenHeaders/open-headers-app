/**
 * SourceDependencyEvaluator — pure functions for evaluating source dependencies.
 *
 * Determines whether HTTP sources have all required environment variables
 * resolved and ready. Sources with unresolved {{variables}} are marked
 * as 'waiting_for_deps' until the environment provides values.
 */

import type { ActivationState, Source } from '@openheaders/core';
import type { EnvironmentResolverLike } from './types';

interface DependencyResult {
  ready: boolean;
  missing: string[];
}

/**
 * Check if a single source has all its template variables resolved.
 */
export function evaluateSourceDependencies(
  source: Source,
  envResolver: EnvironmentResolverLike | null,
): DependencyResult {
  if (source.sourceType !== 'http') return { ready: true, missing: [] };

  const requiredVars = extractVariablesFromSource(source);
  if (requiredVars.length === 0) return { ready: true, missing: [] };

  const envVars = envResolver?.loadEnvironmentVariables() ?? {};
  const missing = requiredVars.filter((varName) => !envVars[varName] || envVars[varName] === '');
  return { ready: missing.length === 0, missing };
}

/**
 * Extract all {{variable}} references from a source's configuration fields.
 */
export function extractVariablesFromSource(source: Source): string[] {
  const variables = new Set<string>();
  const pattern = /\{\{(\w+)}}/g;

  const extract = (str: string | undefined) => {
    if (!str) return;
    for (const match of str.matchAll(pattern)) variables.add(match[1]);
  };

  extract(source.sourcePath);
  const opts = source.requestOptions;
  if (opts) {
    extract(opts.body);
    extract(opts.contentType);
    extract(opts.totpSecret);
    if (opts.headers)
      for (const h of opts.headers) {
        extract(h.key);
        extract(h.value);
      }
    if (opts.queryParams)
      for (const p of opts.queryParams) {
        extract(p.key);
        extract(p.value);
      }
  }
  if (source.jsonFilter?.path) extract(source.jsonFilter.path);

  return Array.from(variables);
}

/**
 * Evaluate all sources and set activation state based on dependency resolution.
 */
export function evaluateAllSourceDependencies(
  sources: Source[],
  envResolver: EnvironmentResolverLike | null,
): Source[] {
  return sources.map((source) => {
    if (source.sourceType === 'http') {
      const deps = evaluateSourceDependencies(source, envResolver);
      return {
        ...source,
        activationState: (deps.ready ? 'active' : 'waiting_for_deps') as ActivationState,
        missingDependencies: deps.missing,
      };
    }
    return { ...source, activationState: 'active' as ActivationState, missingDependencies: [] };
  });
}

/**
 * Re-check waiting sources and activate any that now have their dependencies met.
 * Returns the updated source array and the count of newly activated sources.
 */
export function activateReadySources(
  sources: Source[],
  envResolver: EnvironmentResolverLike | null,
): { sources: Source[]; activated: number; hasChanges: boolean } {
  let activated = 0;
  let hasChanges = false;
  const updatedSources = sources.map((source) => {
    if (source.activationState === 'waiting_for_deps') {
      const deps = evaluateSourceDependencies(source, envResolver);
      if (deps.ready) {
        activated++;
        hasChanges = true;
        return { ...source, activationState: 'active' as ActivationState, missingDependencies: [] };
      } else if (JSON.stringify(source.missingDependencies) !== JSON.stringify(deps.missing)) {
        hasChanges = true;
        return { ...source, missingDependencies: deps.missing };
      }
    }
    return source;
  });

  return { sources: updatedSources, activated, hasChanges };
}
