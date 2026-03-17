// Workspace services exports
import { WorkspaceSettingsService } from './WorkspaceSettingsService';
import { WorkspaceSyncScheduler } from './WorkspaceSyncScheduler';
import { detectAndValidateConfig } from './config-file-detector';
import { parseConfigPath, getSearchPatterns, getPathErrorMessage } from './config-path-parser';
import { GitAutoInstaller } from './git-auto-installer';
import { GitConnectionProgress } from './git/utils/GitConnectionProgress';
import GitSyncService from './git/GitSyncService';

export {
  WorkspaceSettingsService,
  WorkspaceSyncScheduler,
  detectAndValidateConfig as configFileDetector,
  parseConfigPath,
  getSearchPatterns,
  getPathErrorMessage,
  GitAutoInstaller as gitAutoInstaller,
  GitConnectionProgress as gitConnectionProgress,
  GitSyncService as gitSyncService
};
