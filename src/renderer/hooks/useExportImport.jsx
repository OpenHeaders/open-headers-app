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
export function useExportImport(dependencies) {
  const dependencyValidation = useMemo(() => {
    const validation = validateDependencies(dependencies);
    if (!validation.success) {
      log.error('Invalid dependencies:', validation.error);
      console.error('useExportImport dependency validation failed:', validation.error);
    }
    return validation;
  }, [dependencies]);

  const [loading, setLoading] = useState({
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
    console.log('=== showImportModal CALLED ===');
    console.log('services.importService exists:', !!services.importService);
    console.log('Current importModalVisible state:', importModalVisible);
    
    if (!services.importService) {
      log.error('Cannot show import modal: import service not available');
      console.error('Cannot show import modal: import service not available');
      console.error('services:', services);
      console.error('dependencyValidation:', dependencyValidation);
      return;
    }
    console.log('useExportImport: Setting import modal visible to true');
    setImportModalVisible(true);
    
    // Add a check to confirm the state was set
    setTimeout(() => {
      console.log('After 50ms, importModalVisible should be true');
    }, 50);
  }, [services.importService, importModalVisible, services, dependencyValidation]);

  const hideExportModal = useCallback(() => {
    setExportModalVisible(false);
  }, []);

  const hideImportModal = useCallback(() => {
    setImportModalVisible(false);
  }, []);

  // Export Handler
  const handleExport = useCallback(async (exportOptions) => {
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
  const handleImport = useCallback(async (importOptions) => {
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

