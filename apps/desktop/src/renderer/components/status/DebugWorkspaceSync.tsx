import React, { useEffect, useState } from 'react';
import type { Workspace, WorkspaceSyncStatus } from '../../../types/workspace';
import { isSyncableWorkspace } from '../../../types/workspace';
import { useWorkspaces } from '../../hooks/workspace';

function formatTimeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function formatTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString();
}

interface WorkspaceRow {
  workspace: Workspace;
  status: WorkspaceSyncStatus;
}

export const DebugWorkspaceSync = ({ inFooter = false }: { inFooter?: boolean }) => {
  const { workspaces, activeWorkspaceId, syncStatus } = useWorkspaces();
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setTick] = useState(0);

  // Tick every 5s to refresh time-ago values
  useEffect(() => {
    if (!isExpanded) return;
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [isExpanded]);

  const teamWorkspaces: WorkspaceRow[] = workspaces
    .filter((w) => isSyncableWorkspace(w))
    .map((w) => ({
      workspace: w,
      status: syncStatus[w.id] || {},
    }));

  const baseStyle = {
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 4,
  };

  const style = inFooter
    ? baseStyle
    : {
        ...baseStyle,
        position: 'fixed' as const,
        bottom: 10,
        left: 10,
        zIndex: 9999,
      };

  return (
    <>
      <div style={style} onClick={() => setIsExpanded(!isExpanded)}>
        Workspaces ({teamWorkspaces.length})
      </div>

      {isExpanded && (
        <div
          style={{
            position: 'fixed',
            bottom: 50,
            left: 10,
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: 10,
            fontSize: 11,
            maxWidth: 520,
            maxHeight: 300,
            overflow: 'auto',
            zIndex: 9999,
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Debug: Workspace Sync</h4>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 16,
                padding: 0,
                marginLeft: 10,
              }}
              onClick={() => setIsExpanded(false)}
            >
              ×
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            {teamWorkspaces.length === 0 && <div style={{ color: '#999' }}>No syncable (git) workspaces</div>}
            {teamWorkspaces.map(({ workspace, status }) => {
              const isActive = workspace.id === activeWorkspaceId;
              const isSyncing = status.syncing;
              const hasError = !!status.error;

              const statusColor = isSyncing ? '#40a9ff' : hasError ? '#ff6b6b' : status.lastSync ? '#52c41a' : '#999';

              const statusLabel = isSyncing ? 'SYNCING' : hasError ? 'ERROR' : status.lastSync ? 'OK' : 'PENDING';

              return (
                <div
                  key={workspace.id}
                  style={{
                    marginBottom: 10,
                    borderBottom: '1px solid #444',
                    paddingBottom: 8,
                  }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
                  >
                    <div>
                      <span style={{ fontWeight: 'bold' }}>{workspace.name}</span>
                      {isActive && <span style={{ color: '#52c41a', marginLeft: 6 }}>ACTIVE</span>}
                    </div>
                    <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusLabel}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', color: '#ccc' }}>
                    <div>
                      ID: <span style={{ color: '#fff' }}>{workspace.id.substring(0, 20)}...</span>
                    </div>
                    <div>
                      Type: <span style={{ color: '#fff' }}>{workspace.type}</span>
                    </div>
                    <div>
                      Auto-sync: <span style={{ color: '#fff' }}>{workspace.autoSync !== false ? 'Yes' : 'No'}</span>
                    </div>
                    <div>
                      Branch: <span style={{ color: '#fff' }}>{workspace.gitBranch || 'main'}</span>
                    </div>
                    <div>
                      Last Sync: <span style={{ color: '#fff' }}>{formatTimeAgo(status.lastSync)}</span>
                    </div>
                    <div>
                      At: <span style={{ color: '#fff' }}>{formatTimestamp(status.lastSync)}</span>
                    </div>
                    {workspace.metadata && (
                      <>
                        <div>
                          Sources: <span style={{ color: '#fff' }}>{workspace.metadata.sourceCount ?? '—'}</span>
                        </div>
                        <div>
                          Rules: <span style={{ color: '#fff' }}>{workspace.metadata.ruleCount ?? '—'}</span>
                        </div>
                        <div>
                          Proxy Rules: <span style={{ color: '#fff' }}>{workspace.metadata.proxyRuleCount ?? '—'}</span>
                        </div>
                        <div>
                          Data Load:{' '}
                          <span style={{ color: '#fff' }}>{formatTimestamp(workspace.metadata.lastDataLoad)}</span>
                        </div>
                      </>
                    )}
                    {status.commitInfo && (
                      <>
                        <div>
                          Commit: <span style={{ color: '#fff' }}>{status.lastCommit?.substring(0, 7) || '—'}</span>
                        </div>
                        <div>
                          Author: <span style={{ color: '#fff' }}>{status.commitInfo.author || '—'}</span>
                        </div>
                      </>
                    )}
                    {status.commitInfo?.message && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        Message: <span style={{ color: '#fff' }}>{status.commitInfo.message.substring(0, 60)}</span>
                      </div>
                    )}
                    {hasError && <div style={{ gridColumn: '1 / -1', color: '#ff6b6b' }}>Error: {status.error}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
