import React, { useState } from 'react';
import { App } from 'antd';
import { prepareAuthData, prepareWorkspaceData } from '../../utils';
import type { WorkspaceFormValues } from '../../utils/WorkspaceUtils';
import type { WorkspaceContextType } from '../../services/WorkspaceServiceAdapter';

import { createLogger } from '../../../../../utils/error-handling/logger';
const log = createLogger('WorkspaceOperations');

/**
 * Custom hook for workspace CRUD operations
 *
 * Handles workspace creation, updating, deletion, and cloning
 * with proper error handling and user feedback.
 */
export const useWorkspaceOperations = (workspaceContext: WorkspaceContextType) => {
    const { message, modal } = App.useApp();
    const {
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        cloneWorkspaceToPersonal
    } = workspaceContext;
    
    const [loading, setLoading] = useState(false);
    
    /**
     * Saves workspace with proper error handling
     * @param {Object} values - Form values
     * @param {Object} editingWorkspace - Workspace being edited (if any)
     * @returns {Promise<Object>} Save result with success status and result data
     */
    const handleSaveWorkspace = async (values: WorkspaceFormValues, editingWorkspace: { id?: string } | null) => {
        setLoading(true);
        try {
            const authData = await prepareAuthData(values, values.authType || 'none');
            const workspace = prepareWorkspaceData(values, editingWorkspace, authData);

            if (!workspace.name) {
                throw new Error('Workspace name is required');
            }

            const result = editingWorkspace
                ? await updateWorkspace(workspace.id, workspace)
                : await createWorkspace({ ...workspace, name: workspace.name, type: workspace.type, id: workspace.id });

            if (result) {
                void message.success(`Workspace ${editingWorkspace ? 'updated' : 'created'} successfully`);
                return { success: true, result };
            } else {
                void message.error(`Failed to ${editingWorkspace ? 'update' : 'create'} workspace`);
                return { success: false };
            }
        } catch (error) {
            log.error('Error saving workspace:', error);
            void message.error(`Failed to save workspace: ${(error as Error).message}`);
            return { success: false, error };
        } finally {
            setLoading(false);
        }
    };
    
    /**
     * Handles workspace deletion with confirmation
     * @param {Object} workspace - Workspace to delete
     */
    const handleDeleteWorkspace = async (workspace: { id: string; name: string; isDefault?: boolean }) => {
        if (workspace.id === 'default-personal' || workspace.isDefault) {
            void message.error('Cannot delete the default personal workspace');
            return;
        }

        modal.confirm({
            title: 'Delete Workspace',
            content: `Are you sure you want to delete "${workspace.name}"? This action cannot be undone.`,
            okText: 'Delete',
            okType: 'danger',
            onOk: async () => {
                const success = await deleteWorkspace(workspace.id);
                if (success) {
                    void message.success('Workspace deleted successfully');
                } else {
                    void message.error('Failed to delete workspace');
                }
            }
        });
    };

    /**
     * Handles cloning workspace to personal
     */
    const handleCloneToPersonal = async (workspace: { id: string; name: string }) => {
        modal.confirm({
            title: 'Clone to Personal Workspace',
            content: (
                <div>
                    <p>
                        This will create a new personal workspace with the current configuration from "{workspace.name}".
                    </p>
                    <p style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
                        The new workspace will be independent and won't sync with the Git repository.
                    </p>
                </div>
            ),
            okText: 'Clone',
            onOk: async () => {
                const newName = `${workspace.name} (Personal Copy)`;
                const success = await cloneWorkspaceToPersonal?.(workspace.id, newName);
                if (success) {
                    void message.success(`Created personal workspace: ${newName}`);
                } else {
                    void message.error('Failed to clone workspace');
                }
            }
        });
    };
    
    /**
     * Handles SSH key file browsing
     * @param {Object} form - Form instance
     */
    const handleBrowseSSHKey = async (form: { setFieldsValue: (values: { sshKeyPath: string }) => void }) => {
        const filePath = await window.electronAPI.openFileDialog();
        if (filePath) {
            form.setFieldsValue({ sshKeyPath: filePath });
        }
    };
    
    return {
        // State
        loading,
        
        // Actions
        handleSaveWorkspace,
        handleDeleteWorkspace,
        handleCloneToPersonal,
        handleBrowseSSHKey
    };
};
