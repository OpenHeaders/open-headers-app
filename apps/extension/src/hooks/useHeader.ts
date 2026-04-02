import type { HeaderContextValue } from '@context/HeaderContext';
import { HeaderContext } from '@context/HeaderContext';
import { useContext } from 'react';

/**
 * Custom hook to access the header context
 */
export const useHeader = (): HeaderContextValue => {
  const context = useContext(HeaderContext);

  if (context === undefined) {
    throw new Error('useHeader must be used within a HeaderProvider');
  }

  return context;
};
