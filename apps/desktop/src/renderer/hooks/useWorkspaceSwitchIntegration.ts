import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import React, { useEffect } from 'react';
import { useWorkspaceSwitch } from '../contexts';
import { showMessage } from '../utils/ui/messageUtil';
import { useCentralizedWorkspace } from './useCentralizedWorkspace';

interface UseWorkspaceSwitchIntegrationReturn {
  switchWorkspaceWithProgress: (workspaceId: string) => Promise<void>;
}

/**
 * Integration hook that shows switching overlay when workspace changes.
 * Subscribes to IPC events from main-process WorkspaceStateService:
 *  - workspace:switch-progress — shows overlay with progress + target workspace info
 */
export const useWorkspaceSwitchIntegration = (): UseWorkspaceSwitchIntegrationReturn => {
  const { startSwitch, completeSwitch, switchState } = useWorkspaceSwitch();
  const { service } = useCentralizedWorkspace();

  useEffect(() => {
    if (!window.electronAPI?.workspaceState) return;

    // Listen for switch progress from main process via IPC
    const cleanupProgress = window.electronAPI.workspaceState.onSwitchProgress((progress) => {
      if (progress.step === 'saving' && progress.targetWorkspace) {
        // Switch is starting — show overlay with target workspace info
        startSwitch(progress.targetWorkspace);
      }

      if (progress.step === 'complete') {
        const targetName = progress.targetWorkspace?.name ?? switchState.targetWorkspace?.name ?? 'workspace';
        const targetType = progress.targetWorkspace?.type ?? switchState.targetWorkspace?.type;

        const elapsed = Date.now() - (switchState.startTime ?? 0);
        const remainingTime = Math.max(0, 1000 - elapsed);

        completeSwitch();

        setTimeout(() => {
          const icon = targetType === 'git' ? React.createElement(TeamOutlined) : React.createElement(UserOutlined);

          showMessage('success', React.createElement('span', null, 'Switched to ', icon, ' ', targetName));
        }, remainingTime + 150);
      }
    });

    return () => {
      cleanupProgress();
    };
  }, [startSwitch, completeSwitch, switchState]);

  const switchWorkspaceWithProgress = async (workspaceId: string): Promise<void> => {
    try {
      await service.switchWorkspace(workspaceId);
    } catch (error) {
      console.error('Workspace switch failed:', error);
    }
  };

  return {
    switchWorkspaceWithProgress,
  };
};
