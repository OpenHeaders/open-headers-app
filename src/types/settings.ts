/**
 * Application settings types.
 *
 * Persisted in settings.json at the userData path.
 */

export interface AppSettings {
  launchAtLogin: boolean;
  hideOnLaunch: boolean;
  showDockIcon: boolean;
  showStatusBarIcon: boolean;
  theme: 'auto' | 'light' | 'dark';
  autoStartProxy: boolean;
  proxyCacheEnabled: boolean;
  videoRecording: boolean;
  pendingVideoRecording?: boolean;
  videoQuality: 'standard' | 'high' | 'ultra';
  autoHighlightTableEntries: boolean;
  autoScrollTableEntries: boolean;
  compactMode: boolean;
  tutorialMode: boolean;
  developerMode: boolean;
  recordingHotkey: string;
  logLevel: string;
  autoSyncWorkspaces?: boolean;
}
