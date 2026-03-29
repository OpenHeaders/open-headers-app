/**
 * General Utilities
 *
 * Re-exports hash functions from @openheaders/core and adds
 * extension-specific utilities.
 */

export { generateSourcesHash, generateSavedDataHash } from '@openheaders/core/utils';

/**
 * Create a debounce function to avoid too many rapid updates
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    return function (this: unknown, ...args: Parameters<T>): void {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}
