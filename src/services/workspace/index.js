// Workspace services exports
module.exports = {
  WorkspaceSettingsService: require('./WorkspaceSettingsService'),
  WorkspaceSyncScheduler: require('./WorkspaceSyncScheduler'),
  configFileDetector: require('./config-file-detector'),
  configPathParser: require('./config-path-parser'),
  gitAutoInstaller: require('./git-auto-installer'),
  gitConnectionProgress: require('./git/utils/GitConnectionProgress'),
  gitSyncService: require('./git/GitSyncService')
};