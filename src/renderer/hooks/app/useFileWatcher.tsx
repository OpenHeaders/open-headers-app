/**
 * File Watcher Hook
 *
 * Monitors file changes and refreshes sources when files are modified.
 */

import { useEffect } from 'react';
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useFileWatcher');

interface UseFileWatcherDeps {
  refreshSource: (sourceId: string) => void;
}

/**
 * Hook for monitoring file changes
 */
export function useFileWatcher({ refreshSource }: UseFileWatcherDeps): void {
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileChanged((sourceId: string, content: string) => {
      log.debug(`File changed event for sourceId: ${sourceId}, content: ${content.substring(0, 50)}`);
      refreshSource(sourceId);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [refreshSource]);
}
