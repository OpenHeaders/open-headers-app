import { App } from 'antd';
import { useState } from 'react';
import type { WorkspaceContextType } from '@/renderer/components/features/workspaces/services/WorkspaceServiceAdapter';
import { prepareAuthData, prepareWorkspaceData } from '@/renderer/components/features/workspaces/utils';
import type { WorkspaceFormValues } from '@/renderer/components/features/workspaces/utils/WorkspaceUtils';
import { createLogger } from '@/renderer/utils/error-handling/logger';

const log = createLogger('WorkspaceOperations');

/**
 * Custom hook for workspace CRUD operations
 *
 * Handles workspace creation, updating, deletion, and cloning
 * with proper error handling and user feedback.
 */
export const useWorkspaceOperations = (workspaceContext: WorkspaceContextType) => {
  const { message, modal } = App.useApp();
  const { createWorkspace, updateWorkspace, deleteWorkspace, cloneWorkspaceToPersonal } = workspaceContext;

  const [loading, setLoading] = useState(false);

  /**
   * Saves workspace with proper error handling
   *  values - Form values
   *  editingWorkspace - Workspace being edited (if any)
   *  Save result with success status and result data
   */
  const handleSaveWorkspace = async (values: WorkspaceFormValues, editingWorkspace: { id?: string } | null) => {
    setLoading(true);
    try {
      const authData = await prepareAuthData(values, values.authType || 'none');
      const workspace = prepareWorkspaceData(values, editingWorkspace, authData);

      if (!workspace.name) {
        void message.error('Workspace name is required');
        return { success: false };
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
      void message.error(`Failed to save workspace: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles workspace deletion with confirmation
   *  workspace - Workspace to delete
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
      },
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
          <p>This will create a new personal workspace with the current configuration from "{workspace.name}".</p>
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
      },
    });
  };

  /**
   * Handles SSH key file browsing
   *  form - Form instance
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
    handleBrowseSSHKey,
  };
};
