import { useEffect } from 'react';
import { useWorkspaceSwitch } from '../contexts';
import { useCentralizedWorkspace } from './useCentralizedWorkspace';
import { showMessage } from '../utils/ui/messageUtil';
import React from 'react';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';

/**
 * Integration hook that shows simple switching overlay when workspace changes
 */
export const useWorkspaceSwitchIntegration = () => {
    const { startSwitch, completeSwitch, switchState } = useWorkspaceSwitch();
    const { service, workspaces, activeWorkspaceId } = useCentralizedWorkspace();

    useEffect(() => {
        // Listen for workspace switch start
        const handleSwitchProgress = (event) => {
            const { step, workspaceId, workspace } = event.detail;
            
            // Show overlay when switching starts
            if (step === 'saving') {
                const targetWorkspace = workspace || workspaces.find(w => w.id === workspaceId);
                startSwitch(targetWorkspace);
            }
        };

        // Listen for workspace switch completion
        const handleSwitchComplete = () => {
            console.log('[WorkspaceSwitch] Received workspace-data-applied event, calling completeSwitch');
            
            // Get the workspace that was switched to
            const currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
            const workspaceName = switchState.targetWorkspace?.name || currentWorkspace?.name || 'workspace';
            
            // Calculate how long the overlay has been shown
            const elapsed = Date.now() - (switchState.startTime || 0);
            const remainingTime = Math.max(0, 1000 - elapsed); // Minimum 1 second overlay
            
            // Complete the switch (which may delay hiding overlay)
            completeSwitch();
            
            // Show success notification after overlay actually disappears
            setTimeout(() => {
                const workspace = switchState.targetWorkspace || currentWorkspace;
                const icon = workspace?.type === 'git' ? <TeamOutlined /> : <UserOutlined />;
                
                showMessage('success', (
                    <span>
                        Switched to {icon} {workspaceName}
                    </span>
                ));
            }, remainingTime + 150); // Wait for overlay to hide + small buffer
        };

        // Add event listeners
        window.addEventListener('workspace-switch-progress', handleSwitchProgress);
        window.addEventListener('workspace-data-applied', handleSwitchComplete);

        // Cleanup
        return () => {
            window.removeEventListener('workspace-switch-progress', handleSwitchProgress);
            window.removeEventListener('workspace-data-applied', handleSwitchComplete);
        };
    }, [startSwitch, completeSwitch, workspaces, activeWorkspaceId, switchState]);

    // Enhanced switch workspace method
    const switchWorkspaceWithProgress = async (workspaceId) => {
        try {
            await service.switchWorkspace(workspaceId);
        } catch (error) {
            console.error('Workspace switch failed:', error);
        }
    };

    return {
        switchWorkspaceWithProgress
    };
};