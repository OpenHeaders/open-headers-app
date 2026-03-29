/**
 * WebSocket domain types.
 *
 * Shared types for the WebSocket service layer.
 */

import type WS from 'ws';

export interface ExtendedWebSocket extends WS {
  clientId?: string;
  isAlive?: boolean;
  isInitialized?: boolean;
}

export interface WSClientInfo {
  id: string;
  connectionType: string;
  browser: string;
  browserVersion: string;
  platform: string;
  userAgent: string;
  connectedAt: Date;
  lastActivity: Date;
  extensionVersion?: string;
}
