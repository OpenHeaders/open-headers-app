import type React from 'react';
import { createContext } from 'react';
import { useCentralizedEnvironments } from '../../hooks/useCentralizedEnvironments';

// Create and export the context
export const EnvironmentContext = createContext<ReturnType<typeof useCentralizedEnvironments> | null>(null);

// Re-export the hook from centralized implementation
export { useCentralizedEnvironments as useEnvironments } from '../../hooks/useCentralizedEnvironments';

// EnvironmentProvider component
export const EnvironmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const environmentState = useCentralizedEnvironments();

  return <EnvironmentContext.Provider value={environmentState}>{children}</EnvironmentContext.Provider>;
};
