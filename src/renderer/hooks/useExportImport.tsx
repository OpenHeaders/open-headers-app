/**
 * Export/Import Hook
 *
 * Provides interface for export/import operations using modular services.
 * Handles UI state management and delegates business logic to service classes.
 */

import { useState, useCallback, useMemo } from 'react';
import { createExportImportServices, validateDependencies } from '../services/export-import';
import { createLogger } from '../utils/error-handling/logger';

const log = createLogger('useExportImport');

interface LoadingState {
  export: boolean;
  import: boolean;
}

interface ExportImportDependencies {
  appVersion: string;
  sources: any[];
  activeWorkspaceId: string;
  exportSources: () => any[];
  removeSource: (sourceId: string) => Promise<boolean>;
  workspaces: any[];
  createWorkspace: (workspace: any) => Promise<any>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  environments: Record<string, any>;
  createEnvironment: (name: string) => Promise<boolean>;
  setVariable: (name: string, value: string | null, environment?: string | null, isSecret?: boolean) => Promise<boolean>;
  generateEnvironmentSchema: (sources: any[]) => any;
  [key: string]: unknown;
}

interface UseExportImportReturn {
  loading: LoadingState;
  exportModalVisible: boolean;
  importModalVisible: boolean;
  isServiceHealthy: boolean;
  showExportModal: () => void;
  showImportModal: () => void;
  hideExportModal: () => void;
  hideImportModal: () => void;
  setExportModalVisible: (visible: boolean) => void;
  setImportModalVisible: (visible: boolean) => void;
  handleExport: (exportOptions: any) => Promise<void>;
  handleImport: (importOptions: any) => Promise<void>;
  exportService: any;
  importService: any;
  dependencyValidation: any;
}

export function useExportImport(dependencies: ExportImportDependencies): UseExportImportReturn {
  const dependencyValidation = useMemo(() => {
    const validation = validateDependencies(dependencies);
    if (!validation.success) {
      log.error('Invalid dependencies:', validation.error);
      console.error('useExportImport dependency validation failed:', validation.error);
    }
    return validation;
  }, [dependencies]);

  const [loading, setLoading] = useState<LoadingState>({
    export: false,
    import: false
  });

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);

  const services = useMemo(() => {
    if (!dependencyValidation.success) {
      log.warn('Creating services with invalid dependencies');
      return { exportService: null, importService: null };
    }

    try {
      return createExportImportServices(dependencies);
    } catch (error) {
      log.error('Failed to create export/import services:', error);
      return { exportService: null, importService: null };
    }
  }, [dependencies, dependencyValidation.success]);

  // Modal Management Handlers
  const showExportModal = useCallback(() => {
    if (!services.exportService) {
      log.error('Cannot show export modal: export service not available');
      return;
    }
    setExportModalVisible(true);
  }, [services.exportService]);

  const showImportModal = useCallback(() => {
    // Always show the modal — service availability is checked when user clicks Import
    setImportModalVisible(true);
  }, []);

  const hideExportModal = useCallback(() => {
    setExportModalVisible(false);
  }, []);

  const hideImportModal = useCallback(() => {
    setImportModalVisible(false);
  }, []);

  // Export Handler
  const handleExport = useCallback(async (exportOptions: any): Promise<void> => {
    if (!services.exportService) {
      log.error('Cannot handle export: export service not available');
      throw new Error('Export service is not available. Please check your configuration.');
    }

    setLoading(prev => ({ export: true, import: prev.import }));

    try {
      log.info('Starting export operation');
      await services.exportService.execute(exportOptions);

      // Close modal on successful export
      setExportModalVisible(false);
      log.info('Export operation completed successfully');

    } catch (error) {
      log.error('Export operation failed:', error);
      throw error; // Re-throw to allow caller to handle
    } finally {
      setLoading(prev => ({ export: false, import: prev.import }));
    }
  }, [services.exportService]);

  // Import Handler
  const handleImport = useCallback(async (importOptions: any): Promise<void> => {
    if (!services.importService) {
      log.error('Cannot handle import: import service not available');
      throw new Error('Import service is not available. Please check your configuration.');
    }

    setLoading(prev => ({ export: prev.export, import: true }));

    try {
      log.info('Starting import operation', {
        mode: importOptions.importMode,
        isGitSync: importOptions.isGitSync
      });

      await services.importService.execute(importOptions);

      // Close modal on successful import (unless it's a Git sync operation)
      if (!importOptions.isGitSync) {
        setImportModalVisible(false);
      }

      log.info('Import operation completed successfully');

    } catch (error) {
      log.error('Import operation failed:', error);
      throw error; // Re-throw to allow caller to handle
    } finally {
      setLoading(prev => ({ export: prev.export, import: false }));
    }
  }, [services.importService]);

  const isServiceHealthy = useMemo(() => {
    return dependencyValidation.success &&
           services.exportService !== null &&
           services.importService !== null;
  }, [dependencyValidation.success, services.exportService, services.importService]);

  return {
    loading,
    exportModalVisible,
    importModalVisible,
    isServiceHealthy,
    showExportModal,
    showImportModal,
    hideExportModal,
    hideImportModal,
    setExportModalVisible,
    setImportModalVisible,
    handleExport,
    handleImport,
    exportService: services.exportService,
    importService: services.importService,
    dependencyValidation
  };
}
