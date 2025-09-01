/**
 * CentralizedWorkspaceService - Refactored to use modular components
 * 
 * This service coordinates:
 * - Workspace switching
 * - Sources (HTTP, File, Environment)
 * - Header Rules
 * - Proxy Rules
 * - Environments and Variables
 */

const { createLogger } = require('../utils/error-handling/logger');
const { getCentralizedEnvironmentService } = require('./CentralizedEnvironmentService');
const {
  BaseStateManager,
  WorkspaceManager,
  SourceManager,
  RulesManager,
  AutoSaveManager,
  SyncManager,
  BroadcastManager
} = require('./workspace');

const log = createLogger('CentralizedWorkspaceService');

class CentralizedWorkspaceService extends BaseStateManager {
  constructor() {
    super('CentralizedWorkspaceService');
    
    // Initialize state
    this.state = {
      // Core state
      initialized: false,
      loading: false,
      error: null,
      
      // Workspace state
      workspaces: [],
      activeWorkspaceId: 'default-personal',
      isWorkspaceSwitching: false,
      syncStatus: {},
      
      // Data state (current workspace data)
      sources: [],
      rules: { header: [], request: [], response: [] },
      proxyRules: [],
      
      // Metadata
      lastSaved: {}
    };
    
    // Initialize managers
    this.workspaceManager = new WorkspaceManager(window.electronAPI);
    this.sourceManager = new SourceManager(window.electronAPI, getCentralizedEnvironmentService());
    this.rulesManager = new RulesManager(window.electronAPI, window.electronAPI);
    this.autoSaveManager = new AutoSaveManager();
    this.syncManager = new SyncManager(window.electronAPI);
    this.broadcastManager = new BroadcastManager(window.electronAPI);
    
    // Other properties
    this.initPromise = null;
    this.loadPromises = new Map();
    this.eventCleanup = [];
    
    log.info('CentralizedWorkspaceService initialized');
  }

  /**
   * Override setState to handle dirty flags
   */
  setState(updates, changedKeys = []) {
    // Mark as dirty if data changed
    if (changedKeys.includes('sources')) this.autoSaveManager.markDirty('sources');
    if (changedKeys.includes('rules')) this.autoSaveManager.markDirty('rules');
    if (changedKeys.includes('proxyRules')) this.autoSaveManager.markDirty('proxyRules');
    
    super.setState(updates, changedKeys);
    
    // Schedule auto-save for dirty data
    this.autoSaveManager.scheduleAutoSave(() => this.saveAll());
  }

  /**
   * Initialize service
   */
  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  async _doInitialize() {
    try {
      this.setState({ loading: true, error: null });
      
      // Load workspaces configuration
      const workspaceConfig = await this.workspaceManager.loadWorkspaces();
      this.state.workspaces = workspaceConfig.workspaces;
      this.state.activeWorkspaceId = workspaceConfig.activeWorkspaceId;
      this.state.syncStatus = workspaceConfig.syncStatus;
      
      // Ensure active workspace has data containers initialized
      const activeWorkspace = this.state.workspaces.find(w => w.id === this.state.activeWorkspaceId);
      if (activeWorkspace) {
        const integrity = await this.validateWorkspaceIntegrity(this.state.activeWorkspaceId);
        if (!integrity.isValid && integrity.missingFiles && integrity.missingFiles.length > 0) {
          log.info(`Initializing missing data containers for workspace ${this.state.activeWorkspaceId}: ${integrity.missingFiles.join(', ')}`);
          await this.initializeWorkspaceData(this.state.activeWorkspaceId);
        }
      }
      
      // Load active workspace data
      await this.loadWorkspaceData(this.state.activeWorkspaceId);
      
      // Setup listeners
      this.setupEnvironmentListener();
      this.setupSyncListener();
      this.setupRefreshListener();
      
      // Start auto-save
      this.autoSaveManager.startAutoSave(() => this.saveAll());
      
      this.setState({ initialized: true, loading: false }, ['initialized']);
      log.info('Service initialized successfully');
      
      // Check source activations after initialization
      setTimeout(async () => {
        await this.activateReadySources();
      }, 100);
      
      return true;
    } catch (error) {
      log.error('Initialization failed:', error);
      this.setState({ 
        initialized: false, 
        loading: false, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Load all data for a workspace
   */
  async loadWorkspaceData(workspaceId) {
    if (this.loadPromises.has(workspaceId)) {
      return this.loadPromises.get(workspaceId);
    }

    const loadPromise = this._doLoadWorkspaceData(workspaceId);
    this.loadPromises.set(workspaceId, loadPromise);

    try {
      await loadPromise;
    } finally {
      this.loadPromises.delete(workspaceId);
    }
  }

  async _doLoadWorkspaceData(workspaceId) {
    log.info(`Loading data for workspace: ${workspaceId}`);
    
    try {
      // Load sources, rules, and proxy rules in parallel
      const [sources, rules, proxyRules] = await Promise.all([
        this.sourceManager.loadSources(workspaceId),
        this.rulesManager.loadRules(workspaceId),
        this.rulesManager.loadProxyRules(workspaceId)
      ]);

      // Update state with loaded data
      this.setState({
        sources,
        rules,
        proxyRules
      }, ['sources', 'rules', 'proxyRules']);

      // Mark all as clean since we just loaded
      this.autoSaveManager.markClean('sources');
      this.autoSaveManager.markClean('rules');
      this.autoSaveManager.markClean('proxyRules');

      // Update workspace metadata with actual counts
      const totalRules = Object.values(rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
      await this.updateWorkspaceMetadata(workspaceId, {
        sourceCount: sources.length,
        ruleCount: totalRules,
        proxyRuleCount: proxyRules.length,
        lastDataLoad: new Date().toISOString()
      });

      // Update WebSocket and proxy manager
      await this.broadcastManager.broadcastState(sources, rules.header);
      
      log.info(`Successfully loaded workspace data: ${sources.length} sources, ${totalRules} rules, ${proxyRules.length} proxy rules`);
    } catch (error) {
      log.error('Failed to load workspace data:', error);
      throw error;
    }
  }

  /**
   * Switch to a different workspace with progress tracking
   */
  async switchWorkspace(workspaceId, progressCallback = null) {
    if (this.state.activeWorkspaceId === workspaceId) {
      log.debug(`Already in workspace ${workspaceId}`);
      return;
    }

    const previousWorkspaceId = this.state.activeWorkspaceId;
    
    try {
      // Verify workspace exists
      const workspace = this.workspaceManager.validateWorkspaceExists(this.state.workspaces, workspaceId);
      
      log.info(`Starting workspace switch: ${previousWorkspaceId} → ${workspaceId} (${workspace.type})`);
      this.setState({ loading: true, error: null, isWorkspaceSwitching: true });
      
      // Notify AutoSaveManager that workspace is switching
      this.autoSaveManager.setWorkspaceSwitching(true);
      
      // Progress tracking helper
      const updateProgress = (step, progress, label, isGitOperation = false) => {
        if (progressCallback) {
          progressCallback(step, progress, label, isGitOperation);
        }
        // Also dispatch custom event for other components
        window.dispatchEvent(new CustomEvent('workspace-switch-progress', {
          detail: { step, progress, label, isGitOperation, workspaceId, workspace }
        }));
      };
      
      // Step 0: Wait for any pending saves to complete
      updateProgress('preparing', 5, 'Waiting for pending saves...');
      await this.autoSaveManager.waitForSaves();
      
      // Step 1: Save current workspace data (5-25%)
      updateProgress('saving', 10, 'Saving current workspace data...');
      await this.saveAll();
      updateProgress('saving', 25, 'Current workspace saved');
      
      // Step 2: Clear current data (25-35%)
      updateProgress('clearing', 30, 'Clearing current data...');
      
      // Dispatch event to notify RefreshManager to clean up sources
      window.dispatchEvent(new CustomEvent('workspace-switching', {
        detail: { fromWorkspaceId: previousWorkspaceId, toWorkspaceId: workspaceId }
      }));
      
      await this.clearAllData();
      updateProgress('clearing', 35, 'Data cleared');
      
      // Step 3: Update active workspace (35-45%)
      updateProgress('switching', 40, `Switching to "${workspace.name}"...`);
      this.setState({ activeWorkspaceId: workspaceId }, ['activeWorkspaceId']);
      await this.saveWorkspaces();
      
      // Dispatch workspace-switched event
      window.dispatchEvent(new CustomEvent('workspace-switched', {
        detail: { workspaceId, previousWorkspaceId }
      }));
      
      // Notify main process
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('workspace-switched', workspaceId);
      }
      
      updateProgress('switching', 45, 'Workspace context updated');
      
      // Give main process a moment to start processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Step 4: Handle Git sync if needed (45-75%)
      if (workspace.type === 'git' && await this.syncManager.needsInitialSync(workspaceId)) {
        log.info(`New Git workspace detected (${workspaceId}), waiting for initial sync...`);
        updateProgress('syncing', 50, 'Syncing Git workspace...', true);
        
        try {
          await this.syncManager.waitForInitialSync(workspaceId);
          updateProgress('syncing', 70, 'Git sync completed', true);
          // Add a small delay to ensure files are fully written
          await new Promise(resolve => setTimeout(resolve, 500));
          log.info('Initial sync completed, proceeding to load workspace data');
        } catch (error) {
          log.warn('Initial sync failed or timed out:', error.message);
          updateProgress('syncing', 75, 'Git sync timed out, continuing...', true);
          // Continue anyway - workspace might still be usable
        }
      } else {
        updateProgress('syncing', 75, 'No sync required');
      }
      
      // Step 5: Load new workspace data (75-95%)
      updateProgress('loading', 80, 'Loading workspace data...');
      // Set flag to suppress broadcasts during entire switch operation
      this.setState({ isWorkspaceSwitching: true });
      await this.loadWorkspaceData(workspaceId);
      updateProgress('loading', 90, 'Workspace data loaded');
      
      // Step 6: Finalize (95-100%)
      updateProgress('finalizing', 95, 'Updating interface...');
      
      // Dispatch workspace-data-applied event
      window.dispatchEvent(new CustomEvent('workspace-data-applied', {
        detail: { workspaceId, previousWorkspaceId }
      }));
      
      this.setState({ loading: false }, ['activeWorkspaceId']);
      updateProgress('complete', 100, `Successfully switched to "${workspace.name}"`);
      log.info(`Successfully switched to workspace: ${workspaceId}`);
      
      // Clear the suppression flag after a delay to ensure all follow-up operations are suppressed
      setTimeout(() => {
        this.setState({ isWorkspaceSwitching: false });
        // Re-enable auto-save
        this.autoSaveManager.setWorkspaceSwitching(false);
        log.debug('Workspace switch broadcast suppression cleared');
      }, 500);
      
    } catch (error) {
      log.error('Failed to switch workspace:', error);
      
      // Update progress with error
      if (progressCallback) {
        progressCallback('error', 0, `Error: ${error.message}`, false);
      }
      window.dispatchEvent(new CustomEvent('workspace-switch-error', {
        detail: { error: error.message, workspaceId, previousWorkspaceId }
      }));
      
      // Attempt to recover by switching back to previous workspace
      try {
        log.info(`Attempting to recover by switching back to: ${previousWorkspaceId}`);
        this.setState({ activeWorkspaceId: previousWorkspaceId }, ['activeWorkspaceId']);
        await this.saveWorkspaces();
        await this.loadWorkspaceData(previousWorkspaceId);
        
        log.info(`Successfully recovered to workspace: ${previousWorkspaceId}`);
      } catch (recoveryError) {
        log.error('Recovery failed:', recoveryError);
        // If recovery fails, reset to default
        this.setState({ activeWorkspaceId: 'default-personal' }, ['activeWorkspaceId']);
      }
      
      this.setState({ loading: false, error: error.message, isWorkspaceSwitching: false });
      // Re-enable auto-save even on error
      this.autoSaveManager.setWorkspaceSwitching(false);
      throw error;
    }
  }

  /**
   * Save workspaces configuration
   */
  async saveWorkspaces() {
    await this.workspaceManager.saveWorkspaces({
      workspaces: this.state.workspaces,
      activeWorkspaceId: this.state.activeWorkspaceId,
      syncStatus: this.state.syncStatus
    });
  }

  /**
   * Clear all data (used during workspace switch)
   */
  async clearAllData() {
    try {
      // Clear proxy rules
      await this.broadcastManager.clearProxyRules();
      
      this.setState({
        sources: [],
        rules: { header: [], request: [], response: [] },
        proxyRules: []
      }, ['sources', 'rules', 'proxyRules']);
      
      // Update WebSocket
      await this.broadcastManager.broadcastState([], []);
    } catch (error) {
      log.error('Error clearing data:', error);
    }
  }

  /**
   * Save all dirty data
   */
  async saveAll() {
    const saves = [];
    const dirtyState = this.autoSaveManager.getDirtyState();
    
    if (dirtyState.sources) {
      saves.push(this.saveSources());
    }
    if (dirtyState.rules) {
      saves.push(this.saveRules());
    }
    if (dirtyState.proxyRules) {
      saves.push(this.saveProxyRules());
    }

    if (saves.length > 0) {
      await Promise.all(saves);
      log.info(`Saved ${saves.length} data types`);
    }
  }

  /**
   * Save sources
   */
  async saveSources() {
    await this.sourceManager.saveSources(this.state.activeWorkspaceId, this.state.sources);
    this.autoSaveManager.markClean('sources');
    this.state.lastSaved.sources = Date.now();
  }

  /**
   * Save rules
   */
  async saveRules() {
    await this.rulesManager.saveRules(this.state.activeWorkspaceId, this.state.rules);
    this.autoSaveManager.markClean('rules');
    this.state.lastSaved.rules = Date.now();
  }

  /**
   * Save proxy rules
   */
  async saveProxyRules() {
    await this.rulesManager.saveProxyRules(this.state.activeWorkspaceId, this.state.proxyRules);
    this.autoSaveManager.markClean('proxyRules');
    this.state.lastSaved.proxyRules = Date.now();
  }

  // Source Management Methods

  /**
   * Add a new source
   */
  async addSource(sourceData) {
    const sources = [...this.state.sources];
    const newSource = await this.sourceManager.addSource(sources, sourceData);
    
    sources.push(newSource);
    this.setState({ sources }, ['sources']);
    
    // Save immediately to avoid race condition with refresh
    try {
      await this.saveSources();
      
      // Update workspace metadata
      await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
        sourceCount: sources.length,
        lastDataUpdate: new Date().toISOString()
      });
    } catch (saveError) {
      // Rollback the change if save fails
      this.setState({ sources: this.state.sources.filter(s => s.sourceId !== newSource.sourceId) }, ['sources']);
      throw saveError;
    }
    
    return newSource;
  }

  /**
   * Update a source
   */
  async updateSource(sourceId, updates) {
    let updatedSource = null;
    const sources = this.state.sources.map(source => {
      if (source.sourceId === String(sourceId)) {
        const mergedUpdates = { ...updates };
        if (updates.refreshOptions && source.refreshOptions) {
          mergedUpdates.refreshOptions = {
            ...source.refreshOptions,
            ...updates.refreshOptions
          };
        }
        
        updatedSource = { ...source, ...mergedUpdates, updatedAt: new Date().toISOString() };
        
        // Schedule dependency check if needed
        if (updatedSource.sourceType === 'http' && updatedSource.activationState === 'waiting_for_deps') {
          this.sourceManager.evaluateSourceDependencies(updatedSource).then(deps => {
            if (deps.ready) {
              this.updateSourceActivation(updatedSource.sourceId, true);
            }
          });
        }
        
        return updatedSource;
      }
      return source;
    });
    
    this.setState({ sources }, ['sources']);
    
    // Update workspace metadata
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      sourceCount: sources.length,
      lastDataUpdate: new Date().toISOString()
    });
    
    // Broadcast the source update to proxy if it has content
    if (updatedSource && updatedSource.sourceContent && window.electronAPI?.proxyUpdateSource) {
      window.electronAPI.proxyUpdateSource(updatedSource.sourceId, updatedSource.sourceContent);
    }
    
    return updatedSource;
  }

  /**
   * Update source activation state
   */
  updateSourceActivation(sourceId, activate) {
    const sources = this.state.sources.map(source => {
      if (source.sourceId === String(sourceId)) {
        const updated = {
          ...source,
          activationState: activate ? 'active' : source.activationState,
          missingDependencies: activate ? [] : source.missingDependencies
        };
        
        if (activate) {
          log.info(`Source ${sourceId} activated - all dependencies resolved`);
          
          window.dispatchEvent(new CustomEvent('source-activated', {
            detail: { sourceId: updated.sourceId, source: updated }
          }));
        }
        
        return updated;
      }
      return source;
    });
    
    this.setState({ sources }, ['sources']);
  }

  /**
   * Remove a source
   */
  async removeSource(sourceId) {
    const sources = this.state.sources.filter(source => 
      source.sourceId !== String(sourceId)
    );
    
    this.setState({ sources }, ['sources']);
    
    // Update workspace metadata
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      sourceCount: sources.length,
      lastDataUpdate: new Date().toISOString()
    });
  }

  /**
   * Update source content
   */
  async updateSourceContent(sourceId, content) {
    await this.updateSource(sourceId, { sourceContent: content });
  }

  // Rule Management Methods

  /**
   * Add a header rule
   */
  async addHeaderRule(ruleData) {
    const rules = this.rulesManager.addHeaderRule(this.state.rules, ruleData);
    this.setState({ rules }, ['rules']);
    
    // Update workspace metadata
    const totalRules = Object.values(rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      ruleCount: totalRules,
      lastDataUpdate: new Date().toISOString()
    });
  }

  /**
   * Update a header rule
   */
  async updateHeaderRule(ruleId, updates) {
    const rules = this.rulesManager.updateHeaderRule(this.state.rules, ruleId, updates);
    this.setState({ rules }, ['rules']);
    
    // Update workspace metadata
    const totalRules = Object.values(rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      ruleCount: totalRules,
      lastDataUpdate: new Date().toISOString()
    });
  }

  /**
   * Remove a header rule
   */
  async removeHeaderRule(ruleId) {
    const rules = this.rulesManager.removeHeaderRule(this.state.rules, ruleId);
    this.setState({ rules }, ['rules']);
    
    // Update workspace metadata
    const totalRules = Object.values(rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      ruleCount: totalRules,
      lastDataUpdate: new Date().toISOString()
    });
  }

  // Proxy Rule Management Methods

  /**
   * Add a proxy rule
   */
  async addProxyRule(ruleData) {
    const proxyRules = [...this.state.proxyRules, ruleData];
    this.setState({ proxyRules }, ['proxyRules']);
    
    await this.rulesManager.syncProxyRule(ruleData, 'add');
    
    // Update workspace metadata
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      proxyRuleCount: proxyRules.length,
      lastDataUpdate: new Date().toISOString()
    });
  }

  /**
   * Remove a proxy rule
   */
  async removeProxyRule(ruleId) {
    const rule = this.state.proxyRules.find(r => r.id === ruleId);
    const proxyRules = this.state.proxyRules.filter(r => r.id !== ruleId);
    this.setState({ proxyRules }, ['proxyRules']);
    
    if (rule) {
      await this.rulesManager.syncProxyRule(rule, 'remove');
    }
    
    // Update workspace metadata
    await this.updateWorkspaceMetadata(this.state.activeWorkspaceId, {
      proxyRuleCount: proxyRules.length,
      lastDataUpdate: new Date().toISOString()
    });
  }

  // Workspace Management Methods

  /**
   * Create a new workspace with full initialization and auto-switch
   */
  async createWorkspace(workspace) {
    try {
      log.info(`Starting workspace creation: ${workspace.id} (${workspace.type})`);
      
      // Create workspace with enhanced validation
      const newWorkspace = await this.workspaceManager.createWorkspace(this.state.workspaces, workspace);
      
      // Add to workspaces list
      const workspaces = [...this.state.workspaces, newWorkspace];
      this.setState({ workspaces }, ['workspaces']);
      
      // Initialize data containers for the new workspace
      await this.initializeWorkspaceData(newWorkspace.id);
      
      // Save workspaces configuration
      await this.saveWorkspaces();
      
      // Auto-switch to the newly created workspace
      await this.switchWorkspace(newWorkspace.id);
      
      log.info(`Successfully created and switched to workspace: ${newWorkspace.id}`);
      return newWorkspace;
    } catch (error) {
      log.error('Failed to create workspace:', error);
      throw error;
    }
  }

  /**
   * Initialize data containers for a new workspace
   */
  async initializeWorkspaceData(workspaceId) {
    try {
      log.info(`Initializing data containers for workspace: ${workspaceId}`);
      
      // Initialize empty data containers
      await this.sourceManager.saveSources(workspaceId, []);
      await this.rulesManager.saveRules(workspaceId, { header: [], request: [], response: [] });
      await this.rulesManager.saveProxyRules(workspaceId, []);
      
      // Update workspace metadata
      await this.updateWorkspaceMetadata(workspaceId, {
        sourceCount: 0,
        ruleCount: 0,
        proxyRuleCount: 0,
        lastDataUpdate: new Date().toISOString()
      });
      
      log.info(`Successfully initialized data containers for workspace: ${workspaceId}`);
    } catch (error) {
      log.error(`Failed to initialize workspace data for ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Update workspace metadata
   */
  async updateWorkspaceMetadata(workspaceId, metadata) {
    try {
      const workspaces = this.state.workspaces.map(w => 
        w.id === workspaceId 
          ? { ...w, metadata: { ...w.metadata, ...metadata }, updatedAt: new Date().toISOString() }
          : w
      );
      
      this.setState({ workspaces }, ['workspaces']);
      await this.saveWorkspaces();
      
      log.debug(`Updated metadata for workspace: ${workspaceId}`);
    } catch (error) {
      log.error(`Failed to update workspace metadata for ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing workspace
   */
  async updateWorkspace(workspaceId, updates) {
    try {
      // Validate workspace exists
      const existingWorkspace = this.workspaceManager.validateWorkspaceExists(this.state.workspaces, workspaceId);
      
      // Validate updates don't break workspace integrity
      const updatedWorkspace = { ...existingWorkspace, ...updates };
      
      // Re-validate the updated workspace
      if (updates.name && (updates.name.length < 1 || updates.name.length > 100)) {
        throw new Error('Workspace name must be between 1 and 100 characters');
      }
      
      if (updates.type && !['personal', 'team', 'git'].includes(updates.type)) {
        throw new Error('Invalid workspace type. Must be personal, team, or git');
      }
      
      if (updates.type === 'git' && !updatedWorkspace.gitUrl) {
        throw new Error('Git workspace must have a gitUrl');
      }
      
      // Add updatedAt timestamp
      const finalUpdates = {
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const workspaces = this.state.workspaces.map(w => 
        w.id === workspaceId ? { ...w, ...finalUpdates } : w
      );
      this.setState({ workspaces }, ['workspaces']);
      
      await this.saveWorkspaces();
      
      log.info(`Updated workspace: ${workspaceId}`);
      return true;
    } catch (error) {
      log.error('Failed to update workspace:', error);
      throw error;
    }
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(workspaceId) {
    try {
      if (workspaceId === 'default-personal') {
        throw new Error('Cannot delete default personal workspace');
      }
      
      const workspaces = this.state.workspaces.filter(w => w.id !== workspaceId);
      this.setState({ workspaces }, ['workspaces']);
      
      if (this.state.activeWorkspaceId === workspaceId) {
        await this.switchWorkspace('default-personal');
      }
      
      await this.workspaceManager.deleteWorkspaceData(workspaceId);
      await this.saveWorkspaces();
      
      log.info(`Deleted workspace: ${workspaceId}`);
      return true;
    } catch (error) {
      log.error('Failed to delete workspace:', error);
      throw error;
    }
  }

  /**
   * Copy workspace data
   */
  async copyWorkspaceData(sourceWorkspaceId, targetWorkspaceId) {
    try {
      log.info(`Copying workspace data: ${sourceWorkspaceId} → ${targetWorkspaceId}`);
      await this.workspaceManager.copyWorkspaceData(sourceWorkspaceId, targetWorkspaceId);
      
      // Update target workspace metadata after copy
      await this.updateTargetWorkspaceMetadata(targetWorkspaceId);
      
      log.info(`Successfully copied workspace data: ${sourceWorkspaceId} → ${targetWorkspaceId}`);
    } catch (error) {
      log.error('Failed to copy workspace data:', error);
      throw error;
    }
  }

  /**
   * Update target workspace metadata after data copy
   */
  async updateTargetWorkspaceMetadata(workspaceId) {
    try {
      // Load data to get accurate counts
      const [sources, rules, proxyRules] = await Promise.all([
        this.sourceManager.loadSources(workspaceId),
        this.rulesManager.loadRules(workspaceId),
        this.rulesManager.loadProxyRules(workspaceId)
      ]);
      
      const totalRules = Object.values(rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
      
      await this.updateWorkspaceMetadata(workspaceId, {
        sourceCount: sources.length,
        ruleCount: totalRules,
        proxyRuleCount: proxyRules.length,
        lastDataUpdate: new Date().toISOString()
      });
    } catch (error) {
      log.error(`Failed to update target workspace metadata for ${workspaceId}:`, error);
    }
  }

  /**
   * Validate workspace integrity
   */
  async validateWorkspaceIntegrity(workspaceId) {
    try {
      const workspace = this.workspaceManager.validateWorkspaceExists(this.state.workspaces, workspaceId);
      
      // Check if data files exist
      const dataFiles = ['sources.json', 'rules.json', 'proxy-rules.json'];
      const missingFiles = [];
      
      for (const file of dataFiles) {
        try {
          const path = `workspaces/${workspaceId}/${file}`;
          const data = await window.electronAPI.loadFromStorage(path);
          if (!data) {
            missingFiles.push(file);
          }
        } catch (error) {
          missingFiles.push(file);
        }
      }
      
      const isValid = missingFiles.length === 0;
      
      return {
        isValid,
        workspace,
        missingFiles,
        dataDirectory: `workspaces/${workspaceId}`
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  // Utility Methods

  /**
   * Get environment service
   */
  getEnvironmentService() {
    return getCentralizedEnvironmentService();
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.state.initialized && !this.state.loading;
  }

  /**
   * Wait for service to be ready
   */
  async waitForReady(timeout = 10000) {
    const startTime = Date.now();

    while (!this.isReady()) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for workspace service to be ready');
      }

      if (!this.state.loading && !this.initPromise) {
        await this.initialize();
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return true;
  }

  /**
   * Check and activate sources that have their dependencies met
   */
  async activateReadySources() {
    const result = await this.sourceManager.activateReadySources(this.state.sources);
    
    if (result.hasChanges) {
      this.setState({ sources: result.sources }, ['sources']);
      await this.saveSources();
    }
    
    return result.activatedCount;
  }

  // Event Listeners

  /**
   * Setup environment change listener
   */
  setupEnvironmentListener() {
    const handleEnvChange = async () => {
      log.debug('Environment variables changed, checking source activations');
      await this.activateReadySources();
    };
    
    const handleEnvLoaded = async () => {
      log.debug('Environments loaded, checking source activations');
      await this.activateReadySources();
    };
    
    window.addEventListener('environment-variables-changed', handleEnvChange);
    window.addEventListener('environments-loaded', handleEnvLoaded);
    
    this.eventCleanup.push(() => {
      window.removeEventListener('environment-variables-changed', handleEnvChange);
      window.removeEventListener('environments-loaded', handleEnvLoaded);
    });
  }

  /**
   * Setup workspace sync listener
   */
  setupSyncListener() {
    const unsubscribe = this.syncManager.setupSyncListener((data) => {
      const currentSyncStatus = { ...this.state.syncStatus };
      
      if (data.success) {
        // Only update lastSync if it's explicitly provided (meaning actual sync happened with changes)
        const statusUpdate = {
          syncing: false,
          error: null
        };
        
        // Only update lastSync and commit info if provided
        if (data.timestamp) {
          statusUpdate.lastSync = new Date(data.timestamp).toISOString();
        }
        if (data.commitInfo?.commitHash) {
          statusUpdate.lastCommit = data.commitInfo.commitHash;
          statusUpdate.commitInfo = data.commitInfo;
        }
        
        // Merge with existing status to preserve lastSync if not updated
        currentSyncStatus[data.workspaceId] = {
          ...currentSyncStatus[data.workspaceId],
          ...statusUpdate
        };
        
        if (data.workspaceId === this.state.activeWorkspaceId) {
          log.info('Reloading active workspace data after sync');
          
          // Only clean up circuit breakers if there were actual changes
          // This preserves retry state across syncs that don't change configuration
          const hasChanges = data.hasChanges !== false; // Check if sync reported changes
          
          if (hasChanges) {
            // Dispatch event to clean up circuit breakers before reloading
            window.dispatchEvent(new CustomEvent('workspace-syncing', {
              detail: { workspaceId: data.workspaceId, reason: 'git-sync' }
            }));
          }
          
          this.loadWorkspaceData(data.workspaceId).catch(error => {
            log.error('Failed to reload workspace data after sync:', error);
          });
        }
      } else {
        currentSyncStatus[data.workspaceId] = {
          syncing: false,
          error: data.error || 'Sync failed'
        };
      }
      
      this.setState({ syncStatus: currentSyncStatus }, ['syncStatus']);
    });
    
    this.eventCleanup.push(unsubscribe);
  }

  /**
   * Setup refresh listener
   */
  setupRefreshListener() {
    const handleRefresh = async (event) => {
      const workspaceId = event.detail?.workspaceId;
      if (workspaceId && workspaceId === this.state.activeWorkspaceId) {
        log.info('Received workspace data refresh request');
        await this.loadWorkspaceData(workspaceId);
      }
    };
    
    window.addEventListener('workspace-data-refresh-needed', handleRefresh);
    
    this.eventCleanup.push(() => {
      window.removeEventListener('workspace-data-refresh-needed', handleRefresh);
    });
  }

  /**
   * Cleanup service resources
   */
  cleanup() {
    // Stop auto-save
    this.autoSaveManager.stopAutoSave();
    
    // Clean up event listeners
    this.eventCleanup.forEach(cleanup => {
      try {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      } catch (error) {
        log.error('Error during cleanup:', error);
      }
    });
    this.eventCleanup = [];
    
    // Clear base class listeners
    super.cleanup();
    
    log.info('CentralizedWorkspaceService cleaned up');
  }
}

// Create singleton instance
let serviceInstance = null;

export function getCentralizedWorkspaceService() {
  if (!serviceInstance) {
    serviceInstance = new CentralizedWorkspaceService();
    
    // Auto-initialize on first access
    serviceInstance.initialize().catch(error => {
      log.error('Auto-initialization failed:', error);
    });
  }
  return serviceInstance;
}

export { CentralizedWorkspaceService };