/**
 * File Watcher Hook
 * 
 * Monitors file changes and refreshes sources when files are modified.
 */

import { useEffect } from 'react';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useFileWatcher');

/**
 * Hook for monitoring file changes
 * 
 * @param {Object} deps - Dependencies
 * @param {Function} deps.refreshSource - Function to refresh a specific source
 */
export function useFileWatcher({ refreshSource }) {
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileChanged((sourceId, content) => {
      log.debug('File changed event for sourceId:', sourceId, 'content:', content.substring(0, 50));
      refreshSource(sourceId);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [refreshSource]);
}