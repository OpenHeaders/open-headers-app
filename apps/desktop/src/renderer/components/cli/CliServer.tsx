import { CliServerControls, CliServerLogs } from './components';
import { useCliServer } from './hooks';

/**
 * CliServer - Main CLI API server management component
 *
 * Control panel for the local CLI API server that enables programmatic
 * workspace join and environment import from scripts and CLI tools.
 *
 * @param {Object} props
 * @param {boolean} props.active - Whether this tab is currently visible
 * @returns {JSX.Element} CLI server management interface
 */
interface CliServerProps {
  active: boolean;
}
const CliServer = ({ active }: CliServerProps) => {
  const {
    // State
    status,
    logs,
    allLogs,
    loading,
    settings,

    // Filter state
    filterMethod,
    filterEndpoint,
    filterStatus,

    // Actions
    updatePort,
    toggleServer,
    regenerateToken,
    clearLogs,
    exportLogs,
    setFilters,
    clearFilters,
    loadLogs,
  } = useCliServer({ active });

  return (
    <div style={{ padding: '24px' }}>
      <CliServerControls
        status={status}
        loading={loading}
        tutorialMode={settings?.tutorialMode}
        onToggleServer={toggleServer}
        onUpdatePort={(port) => {
          if (port !== null) updatePort(port);
        }}
        onRegenerateToken={regenerateToken}
      />

      {(status.running || allLogs.length > 0) && (
        <CliServerLogs
          logs={logs}
          allLogs={allLogs}
          filterMethod={filterMethod}
          filterEndpoint={filterEndpoint}
          filterStatus={filterStatus}
          onSetFilters={setFilters}
          onClearFilters={clearFilters}
          onClearLogs={clearLogs}
          onExportLogs={exportLogs}
          onRefresh={loadLogs}
        />
      )}
    </div>
  );
};

export default CliServer;
