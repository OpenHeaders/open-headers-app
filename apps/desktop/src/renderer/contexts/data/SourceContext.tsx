import type React from 'react';
import { createContext } from 'react';
import { useSources as useCentralizedSources } from '../../hooks/useCentralizedWorkspace';

// Create and export the context
export const SourceContext = createContext<ReturnType<typeof useCentralizedSources> | null>(null);

// Re-export the hook from centralized implementation
export { useSources } from '../../hooks/useCentralizedWorkspace';

// SourceProvider component
export const SourceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sourceState = useCentralizedSources();

  return <SourceContext.Provider value={sourceState}>{children}</SourceContext.Provider>;
};
