# Export/Import Service Architecture

This directory contains a comprehensive, modular export/import system that replaces the original monolithic `useExportImport.jsx` implementation. The new architecture provides better maintainability, testability, and extensibility.

## 🏗️ Architecture Overview

The export/import system is organized into several layers:

```
export-import/
├── core/                   # Core orchestration services
├── handlers/               # Data-type specific handlers  
├── utilities/              # Shared utility functions
└── hooks/                  # React hooks (in parent directory)
```

### Core Services

- **ExportService** - Orchestrates the complete export process
- **ImportService** - Orchestrates the complete import process
- **ExportImportConfig** - Centralized configuration and constants

### Handlers

Each data type has its own specialized handler:

- **SourcesHandler** - HTTP/File/Environment sources
- **ProxyRulesHandler** - Proxy rules with complex header matching
- **RulesHandler** - Application rules with type-specific processing
- **EnvironmentsHandler** - Environment variables and schemas
- **WorkspaceHandler** - Workspace configurations and Git integration

### Utilities

Shared functionality across all handlers:

- **ValidationUtils** - Comprehensive data validation
- **FileOperations** - File I/O, dialogs, and path management
- **MessageGeneration** - User-friendly success/error messages
- **DuplicateDetection** - Sophisticated duplicate detection algorithms

## 🚀 Quick Start

### Basic Usage

```javascript
import { useExportImport } from '../hooks/useExportImportModular';

function MyComponent() {
  const {
    loading,
    exportModalVisible,
    importModalVisible,
    showExportModal,
    showImportModal,
    handleExport,
    handleImport
  } = useExportImport(dependencies);

  // Use the hook as before, but with improved performance and reliability
}
```

### Advanced Usage

```javascript
import { createExportImportServices } from '../services/export-import';

// Create services directly for advanced use cases
const { exportService, importService } = createExportImportServices(dependencies);

// Execute export with full control
await exportService.execute(exportOptions);

// Create system backup
const backup = await exportService.createCompleteBackup();

// Restore from backup
await importService.restoreFromBackup(backup);
```

### Service-Specific Operations

```javascript
import { SourcesHandler, ProxyRulesHandler } from '../services/export-import/handlers';

// Work with specific data types
const sourcesHandler = new SourcesHandler(dependencies);
const stats = await sourcesHandler.importSources(sourcesToImport, options);

// Analyze data for issues
const analysis = sourcesHandler.analyzeRules(rulesData);
```

## 📋 Migration Guide

### From Original useExportImport

The new modular hook maintains the same interface as the original:

```javascript
// Before (original)
import { useExportImport } from './useExportImport';

// After (modular)  
import { useExportImport } from './useExportImportModular';

// Same usage - no changes needed in components!
const { handleExport, handleImport, loading } = useExportImport(dependencies);
```

### Key Improvements

1. **Performance**: Parallel processing and optimized algorithms
2. **Reliability**: Comprehensive error handling and validation
3. **Maintainability**: Small, focused modules vs. 706-line monolith
4. **Testability**: Individual components can be unit tested
5. **Extensibility**: Easy to add new data types or modify existing ones

## 🔧 Configuration

### Dependencies Required

```javascript
const dependencies = {
  // Core app info
  appVersion: '3.0.0',
  
  // Sources management
  sources: [...],
  exportSources: () => [...],
  removeSource: async (id) => {...},
  
  // Workspace management  
  activeWorkspaceId: 'workspace-123',
  workspaces: [...],
  createWorkspace: async (workspace) => {...},
  switchWorkspace: async (id, workspace) => {...},
  
  // Environment management
  environments: {...},
  createEnvironment: async (name) => {...},
  setVariable: async (name, value, env, isSecret) => {...},
  generateEnvironmentSchema: (sources) => {...}
};
```

### Export Options

```javascript
const exportOptions = {
  selectedItems: {
    sources: true,
    proxyRules: true,
    rules: true,
    environments: true
  },
  environmentOption: 'full', // 'none', 'schema', 'full'
  fileFormat: 'single',      // 'single', 'separate'
  selectedEnvironments: ['prod', 'staging'],
  includeWorkspace: true,
  includeCredentials: false,
  currentWorkspace: {...}
};
```

### Import Options

```javascript
const importOptions = {
  fileContent: '{"version": "3.0.0", ...}',
  envFileContent: '{"environments": {...}}', // optional
  selectedItems: {
    sources: true,
    proxyRules: true,
    rules: true,
    environments: true
  },
  importMode: 'merge',        // 'merge', 'replace'
  selectedEnvironments: ['prod'],
  workspaceInfo: {...},       // optional
  isGitSync: false,          // Git sync vs manual import
  createBackup: true         // Create backup before import
};
```

## 🔍 Error Handling

### Comprehensive Error Recovery

```javascript
try {
  await exportService.execute(options);
} catch (error) {
  // Detailed error information
  console.error('Export failed:', error.message);
  
  // Check if backup is available
  if (options._backup) {
    await importService.restoreFromBackup(options._backup);
  }
}
```

### Validation Errors

```javascript
import { validateDependencies, validateImportPayload } from '../services/export-import';

// Validate dependencies
const validation = validateDependencies(dependencies);
if (!validation.success) {
  console.error('Invalid dependencies:', validation.error);
}

// Validate import data
const importValidation = validateImportPayload(importData);
if (!importValidation.success) {
  console.error('Invalid import data:', importValidation.error);
}
```

## 📊 Statistics and Analysis

### Export Statistics

```javascript
const stats = exportService.getExportStatistics(exportData);
console.log('Export statistics:', {
  totalItems: stats.totalItems,
  estimatedSize: stats.estimatedSize,
  dataTypes: stats.dataTypes
});
```

### Import Statistics

```javascript
const stats = importService.getImportStatistics(importResult);
console.log('Import statistics:', {
  totalImported: stats.totalImported,
  totalSkipped: stats.totalSkipped,
  totalErrors: stats.totalErrors
});
```

### Data Analysis

```javascript
import { ProxyRulesHandler } from '../services/export-import/handlers';

const handler = new ProxyRulesHandler(dependencies);
const analysis = handler.analyzeProxyRules(proxyRules);

console.log('Analysis results:', {
  warnings: analysis.warnings,
  suggestions: analysis.suggestions
});
```

## 🧪 Testing

### Unit Testing Handlers

```javascript
import { SourcesHandler } from '../services/export-import/handlers/SourcesHandler';

describe('SourcesHandler', () => {
  const mockDependencies = {
    sources: [],
    exportSources: jest.fn(),
    removeSource: jest.fn()
  };

  test('should export sources correctly', async () => {
    const handler = new SourcesHandler(mockDependencies);
    const result = await handler.exportSources({ selectedItems: { sources: true } });
    expect(result).toEqual([]);
  });
});
```

### Integration Testing

```javascript
import { createExportImportServices } from '../services/export-import';

describe('Export/Import Integration', () => {
  test('should handle complete export/import cycle', async () => {
    const services = createExportImportServices(dependencies);
    
    // Export data
    await services.exportService.execute(exportOptions);
    
    // Import data back
    await services.importService.execute(importOptions);
    
    // Verify integrity
    // ... assertions
  });
});
```

## 🔧 Extending the System

### Adding a New Data Type

1. **Create Handler**:
```javascript
// handlers/MyDataHandler.js
export class MyDataHandler {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  async exportMyData(options) {
    // Export logic
  }

  async importMyData(data, options) {
    // Import logic
  }
}
```

2. **Add to Services**:
```javascript
// core/ExportService.js
import { MyDataHandler } from '../handlers/MyDataHandler.js';

constructor(dependencies) {
  // ...
  this.myDataHandler = new MyDataHandler(dependencies);
}
```

3. **Update Configuration**:
```javascript
// core/ExportImportConfig.js
export const DATA_TYPES = {
  // ...
  MY_DATA: 'myData'
};
```

### Custom Validation

```javascript
// utilities/ValidationUtils.js
export function validateMyData(data) {
  // Custom validation logic
  return { success: true };
}
```

### Custom Duplicate Detection

```javascript
// utilities/DuplicateDetection.js
export function isMyDataDuplicate(item, existingItems) {
  // Custom duplicate detection logic
  return false;
}
```

## 📝 Best Practices

### Error Handling
- Always use try/catch blocks around service operations
- Provide meaningful error messages to users
- Log errors with appropriate context
- Create backups before destructive operations

### Performance
- Use parallel processing where possible (Promise.all)
- Implement batch operations for large datasets
- Avoid blocking the UI thread
- Cache expensive computations

### Security  
- Validate all input data thoroughly
- Sanitize authentication data before export
- Never log sensitive information
- Use secure file operations

### Maintainability
- Keep handlers focused on single responsibility
- Use consistent error handling patterns
- Document complex algorithms
- Follow established naming conventions

## 🐛 Troubleshooting

### Common Issues

**Service Not Available**
```javascript
if (!hook.isServiceHealthy) {
  console.error('Service validation:', hook.dependencyValidation);
}
```

**Import Validation Failures**
```javascript
// Check import data structure
const validation = validateImportPayload(importData);
if (!validation.success) {
  console.error('Validation failed:', validation.error);
}
```

**File Operation Errors**
```javascript
// Check file path validity
const pathValidation = validateFilePath(filePath);
if (!pathValidation.success) {
  console.error('Invalid file path:', pathValidation.error);
}
```

### Debug Mode

Enable detailed logging:
```javascript
// Set in ExportImportConfig.js
export const LOGGING = {
  MODULE_NAME: 'ExportImport',
  DEBUG_ENABLED: true // Enable for detailed logs
};
```

## 📚 API Reference

For detailed API documentation, see the individual module files:
- [ExportService API](./core/ExportService.js)
- [ImportService API](./core/ImportService.js)
- [Handler APIs](./handlers/)
- [Utility APIs](./utilities/)

## 🤝 Contributing

When contributing to the export/import system:

1. Follow the established architectural patterns
2. Add comprehensive tests for new functionality
3. Update documentation for API changes
4. Ensure backward compatibility where possible
5. Add logging for debugging purposes

---

*This modular architecture transforms the original 706-line monolithic file into a maintainable, testable, and extensible system while preserving all existing functionality.*