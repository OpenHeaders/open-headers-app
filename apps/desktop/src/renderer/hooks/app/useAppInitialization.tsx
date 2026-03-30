/**
 * App Initialization Hook
 *
 * Handles app startup effects including version retrieval and record opening setup.
 */

import { useEffect } from 'react';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import { convertNewRecordingFormat } from '@/renderer/utils/formatters/recordConverter';
import type { RawRecordingRecord, Recording } from '@/types/recording';

const log = createLogger('useAppInitialization');

interface UseAppInitializationDeps {
  setAppVersion: (version: string) => void;
  setActiveTab: (tab: string) => void;
  setCurrentRecord: (record: Recording | null) => void;
}

/**
 * Hook for managing app initialization effects
 */
export function useAppInitialization({
  setAppVersion,
  setActiveTab,
  setCurrentRecord,
}: UseAppInitializationDeps): void {
  useEffect(() => {
    const getAppVersion = async () => {
      try {
        if (window.electronAPI?.getAppVersion) {
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
    const unsubscribe = window.electronAPI.onOpenRecordRecording(async (data) => {
      log.info('Received request to open record recording:', data);
      setActiveTab('record-viewer');
      if (data?.recordId) {
        const fullRecord = await window.electronAPI.loadRecording(data.recordId);
        if (fullRecord?.record) {
          const convertedRecord = convertNewRecordingFormat(fullRecord.record as RawRecordingRecord) as Recording;
          setCurrentRecord(convertedRecord);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setAppVersion, setActiveTab, setCurrentRecord]);
}
