import React, { createContext } from 'react';
import { useWorkspaces as useCentralizedWorkspaces } from '../../hooks/useCentralizedWorkspace';

// Create and export the context
export const WorkspaceContext = createContext(null);

// Re-export the hook from centralized implementation
export { useWorkspaces } from '../../hooks/useCentralizedWorkspace';

// Custom hook to use the workspace context
// WorkspaceProvider component
export const WorkspaceProvider = ({ children }) => {
  const workspaceState = useCentralizedWorkspaces();

  return (
      <WorkspaceContext.Provider value={workspaceState}>
        {children}
      </WorkspaceContext.Provider>
  );
};