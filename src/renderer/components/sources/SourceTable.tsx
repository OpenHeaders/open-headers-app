import { useEnvironments, useRefreshManager } from '../../contexts';
import React, {useState, useEffect, useMemo} from 'react';
import { Table, Empty, Typography, theme } from 'antd';
import EditSourceModal from '../modals/edit-source';
import ContentViewer from '../common/ContentViewer';
import { VirtualizedSimpleTable } from '../common/virtualized-table';
import timeManager from '../../services/TimeManager';
import {
    checkSourceDependencies,
    getRefreshStatusText,
    updateRefreshDisplayStates,
    cleanupDisplayStates,
    createSourceTableColumns,
    createSaveSourceHandler,
    createRefreshSourceHandler,
    createRemoveSourceHandler,
    createModalHandlers
} from './source-table';

const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('SourceTable');

/**
 * SourceTable Component
 * 
 * Main component for displaying and managing HTTP, file, and environment sources
 * with virtualization support for large datasets and comprehensive source management.
 * 
 * This component has been refactored into a modular architecture with extracted
 * utilities, handlers, and managers to improve maintainability and code organization.
 * 
 * Core Features:
 * - Multi-source type support (HTTP, file, environment)
 * - Real-time refresh status monitoring and display
 * - Environment dependency tracking and validation
 * - Template variable detection and resolution
 * - Automatic virtualization for large datasets (>50 sources)
 * - Complete CRUD operations with proper state management
 * 
 * Performance Optimizations:
 * - Virtualized rendering using VirtualizedSimpleTable
 * - Memoized column definitions with dependency tracking
 * - Efficient refresh state management with cleanup
 * - Optimized re-renders with selective state updates
 * 
 * Architecture:
 * - Modular design with extracted utilities and handlers
 * - Integration with RefreshManager for timing coordination
 * - Environment context integration for variable resolution
 * - Proper separation of concerns across multiple modules
 * 
 * Dependencies:
 * - source-table package: Contains all extracted utilities and handlers
 * - RefreshManager: Handles timing and refresh coordination
 * - Environment context: Provides variable resolution
 * - VirtualizedSimpleTable: Handles large dataset rendering
 * 
 * @component
 * @since 3.0.0
 */
const SourceTable = ({
                         sources,
                         onRemoveSource,
                         onRefreshSource,
                         onUpdateSource
                     }) => {
    // State management for refresh display timing and caching
    // Separate from content to avoid unnecessary re-renders
    const [refreshDisplayStates, setRefreshDisplayStates] = useState({});
    
    // Modal visibility states for edit and content viewing
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [contentViewerVisible, setContentViewerVisible] = useState(false);
    
    // Currently selected source ID for modal operations
    const [selectedSourceId, setSelectedSourceId] = useState(null);
    
    // Loading states for visual feedback during operations
    const [refreshingSourceId, setRefreshingSourceId] = useState(null);
    const [removingSourceId, setRemovingSourceId] = useState(null);
    
    // Ant Design theme token for consistent styling
    const { token } = theme.useToken();
    
    // Environment context for variable resolution and dependency tracking
    const envContext = useEnvironments();
    
    // Get RefreshManager from context instead of direct import
    const refreshManager = useRefreshManager();
    
    // Track environment state changes for dependency validation
    const [environmentState, setEnvironmentState] = useState({
        activeEnvironment: envContext.activeEnvironment,
        variables: envContext.getAllVariables()
    });

    // Get the currently selected source from the latest sources array
    // Always use latest data to avoid stale state issues
    const selectedSource = selectedSourceId ?
        sources.find(s => s.sourceId === selectedSourceId) : null;

    // Effect to detect environment changes and update activation states
    useEffect(() => {
        if (!envContext.environmentsReady) return;
        
        const currentEnvState = {
            activeEnvironment: envContext.activeEnvironment,
            variables: envContext.getAllVariables()
        };
        
        // Check if environment has changed
        const hasEnvChanged = currentEnvState.activeEnvironment !== environmentState.activeEnvironment ||
            JSON.stringify(currentEnvState.variables) !== JSON.stringify(environmentState.variables);
        
        if (hasEnvChanged) {
            log.debug('[SourceTable] Environment changed, updating activation states', {
                from: environmentState.activeEnvironment,
                to: currentEnvState.activeEnvironment
            });
            
            // Update environment state
            setEnvironmentState(currentEnvState);
            
            // Check all HTTP sources for missing dependencies
            sources.forEach(source => {
                if (source.sourceType === 'http') {
                    const missingDeps = checkSourceDependencies(source, currentEnvState.variables);
                    
                    // Update source activation state if it has changed
                    if (missingDeps.length > 0 && source.activationState !== 'waiting_for_deps') {
                        log.debug(`[SourceTable] Source ${source.sourceId} now has missing dependencies:`, missingDeps);
                        // Trigger a source update to reflect the new state
                        if (onUpdateSource) {
                            onUpdateSource(source.sourceId, {
                                ...source,
                                activationState: 'waiting_for_deps',
                                missingDependencies: missingDeps
                            });
                        }
                    } else if (missingDeps.length === 0 && source.activationState === 'waiting_for_deps') {
                        log.debug(`[SourceTable] Source ${source.sourceId} dependencies now satisfied`);
                        // Clear the waiting state
                        if (onUpdateSource) {
                            onUpdateSource(source.sourceId, {
                                ...source,
                                activationState: 'active',
                                missingDependencies: []
                            });
                        }
                    }
                }
            });
        }
    }, [envContext.activeEnvironment, envContext.getAllVariables, envContext.environmentsReady, sources]);

    // Environment change detection and dependency validation
    // Monitors environment changes to update source activation states

    // Refresh status text helper with extracted logic
    // Wrapper function that provides all necessary dependencies
    const getRefreshStatus = (source) => getRefreshStatusText(
        source, 
        refreshManager, 
        refreshDisplayStates, 
        refreshingSourceId, 
        timeManager
    );


    // Create handlers using extracted logic from source-table package
    // These handlers encapsulate complex business logic and state management
    
    // Refresh source handler with status tracking and error handling
    const handleRefreshSource = createRefreshSourceHandler({
        onRefreshSource,
        setRefreshingSourceId,
        setRefreshDisplayStates,
        timeManager,
        log
    });
    
    // Save source handler with refresh logic and state management
    const handleSaveSource = createSaveSourceHandler({
        onUpdateSource,
        setRefreshingSourceId,
        setRefreshDisplayStates,
        setEditModalVisible,
        handleRefreshSource, // Pass the refresh handler properly
        log
    });
    
    // Remove source handler with cleanup and user feedback
    const handleRemoveSource = createRemoveSourceHandler({
        onRemoveSource,
        setRemovingSourceId,
        setRefreshDisplayStates,
        sources
    });
    
    // Modal handlers for edit and view operations
    const { handleEditSource, handleViewContent, handleCloseModal } = createModalHandlers({
        setSelectedSourceId,
        setEditModalVisible,
        setContentViewerVisible
    });

    // Update refresh display states using extracted logic
    // Runs every second to update countdown timers and refresh status
    useEffect(() => {
        const timer = setInterval(() => {
            const updatedStates = updateRefreshDisplayStates(
                sources, 
                refreshManager, 
                refreshDisplayStates, 
                refreshingSourceId, 
                timeManager
            );
            setRefreshDisplayStates(updatedStates);
        }, 1000);

        return () => clearInterval(timer);
    }, [sources, refreshingSourceId]);

    // Clean up display states when sources change
    // Removes stale states for deleted sources to prevent memory leaks
    useEffect(() => {
        setRefreshDisplayStates(prev => 
            cleanupDisplayStates(sources, prev, log)
        );
    }, [sources]);

    // All handlers are now created using extracted logic above
    // This section previously contained large handler implementations
    // that have been moved to the source-table package for better organization

    // Determine if we should use virtualization (more than 50 sources)
    // Virtualization improves performance for large datasets
    const useVirtualization = sources.length > 50;

    // Table columns using extracted configuration
    // Memoized to prevent unnecessary re-renders when dependencies haven't changed
    const columns = useMemo(() => createSourceTableColumns({
        token,
        getRefreshStatusText: getRefreshStatus,
        handleViewContent,
        handleEditSource,
        handleRemoveSource,
        handleRefreshSource,
        refreshingSourceId,
        removingSourceId
    }), [token, getRefreshStatus, handleViewContent, handleEditSource, handleRemoveSource, handleRefreshSource, refreshingSourceId, removingSourceId]);

    // Empty state component shown when no sources are available
    // Provides helpful guidance to users on how to add sources
    const emptyText = (
        <Empty
            description="No sources yet"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
            <Typography.Text type="secondary">
                Add a source using the form above
            </Typography.Text>
        </Empty>
    );

    // Render virtualized or regular table based on data size
    // Virtualized table for >50 sources, regular table for smaller datasets
    const tableComponent = useVirtualization ? (
        <VirtualizedSimpleTable
            dataSource={sources}
            columns={columns}
            rowKey={(record) => `source-${record.sourceId}-${record.sourceType}`}
            height={400}
            rowHeight={90} // Increased for multi-line content display
        />
    ) : (
        <Table
            dataSource={sources}
            columns={columns}
            rowKey={(record) => `source-${record.sourceId}-${record.sourceType}`}
            pagination={false}
            locale={{ emptyText }}
            size="small"
            bordered
            scroll={{ x: 'max-content' }}
        />
    );

    return (
        <>
            {/* Main table component with conditional virtualization */}
            {tableComponent}

            {/* Edit Source Modal - only render when visible and source is set */}
            {/* Key prop ensures proper re-mounting when source changes */}
            {editModalVisible && selectedSource && (
                <EditSourceModal
                    key={`edit-source-${selectedSource.sourceId}`}
                    source={selectedSource}
                    open={editModalVisible}
                    onCancel={handleCloseModal}
                    onSave={handleSaveSource}
                    refreshingSourceId={refreshingSourceId} // Pass refreshing state for UI feedback
                />
            )}

            {/* Content Viewer Modal for displaying source content */}
            {/* Always rendered but controlled by open prop for better animation */}
            <ContentViewer
                source={selectedSource}
                open={contentViewerVisible}
                onClose={handleCloseModal}
            />
        </>
    );
};

export default SourceTable;