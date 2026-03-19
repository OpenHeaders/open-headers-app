/**
 * App Initialization Hook
 *
 * Handles app startup effects including version retrieval and record opening setup.
 */

import { useEffect } from 'react';
import { convertNewRecordingFormat } from '../../utils/formatters/recordConverter';
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useAppInitialization');

interface UseAppInitializationDeps {
  setAppVersion: (version: string) => void;
  setActiveTab: (tab: string) => void;
  setCurrentRecord: (record: Record<string, unknown> | null) => void;
}

/**
 * Hook for managing app initialization effects
 */
export function useAppInitialization({ setAppVersion, setActiveTab, setCurrentRecord }: UseAppInitializationDeps): void {
  useEffect(() => {
    const getAppVersion = async () => {
      try {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
          const version = await window.electronAPI.getAppVersion();
          setAppVersion(version);
        }
      } catch (error) {
        log.error('Failed to get app version:', error);
      }
    };

    // Initialize app version on startup
    getAppVersion();

    // Set up listener for opening record recordings from main process
    const unsubscribe = window.electronAPI.onOpenRecordRecording((data: Record<string, unknown>) => {
      log.info('Received request to open record recording:', data);
      setActiveTab('record-viewer');
      if (data && data.record) {
        const convertedRecord = convertNewRecordingFormat(data.record);
        setCurrentRecord(convertedRecord);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setAppVersion, setActiveTab, setCurrentRecord]);
}
