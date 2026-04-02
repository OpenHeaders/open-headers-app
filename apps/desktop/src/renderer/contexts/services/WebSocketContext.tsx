/**
 * WebSocketContext — placeholder context.
 *
 * Source broadcasting to ws-service is now handled entirely by the main-process
 * WorkspaceStateService. This context is kept as a provider shell so existing
 * component trees that wrap children in <WebSocketProvider> don't break.
 */

import type React from 'react';
import { createContext } from 'react';

const WebSocketContext = createContext({});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  return <WebSocketContext.Provider value={{}}>{children}</WebSocketContext.Provider>;
}
