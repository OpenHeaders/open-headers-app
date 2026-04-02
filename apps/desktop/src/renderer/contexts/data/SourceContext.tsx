import type React from 'react';
import { createContext } from 'react';
import { useSources as useCentralizedSources } from '@/renderer/hooks/useCentralizedWorkspace';

// Create and export the context
export const SourceContext = createContext<ReturnType<typeof useCentralizedSources> | null>(null);

// Re-export the hook from centralized implementation
export { useSources } from '@/renderer/hooks/useCentralizedWorkspace';

// SourceProvider component
export const SourceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sourceState = useCentralizedSources();

  return <SourceContext.Provider value={sourceState}>{children}</SourceContext.Provider>;
};
