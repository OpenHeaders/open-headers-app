import { SyncOutlined } from '@ant-design/icons';
import { Badge, Card, Space, Tag, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import { useRefreshManager, useSettings } from '../../contexts';
import { useSources } from '../../hooks/workspace';

const { Text } = Typography;

interface BreakerEntry {
  name: string;
  state: string;
  isOpen: boolean;
  failureCount: number;
  timeUntilNextAttemptMs: number;
}

export function CircuitBreakerStatus({ inFooter = false }: { inFooter?: boolean }) {
  const { settings } = useSettings();
  const refreshManager = useRefreshManager();
  const { sources } = useSources();
  const [, setTick] = useState(0);

  // Poll every 2s to refresh display
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const { token } = theme.useToken();

  if (!settings?.developerMode) return null;

  // Build breaker list from main-process status via RefreshManager context
  const breakers: BreakerEntry[] = [];
  for (const source of sources) {
    if (source.sourceType !== 'http') continue;
    const status = refreshManager.getRefreshStatus(source.sourceId);
    const cb = status.circuitBreaker;
    // Use getTimeUntilRefresh for a live countdown (absolute timestamp that ticks down)
    // instead of cb.timeUntilNextAttemptMs which is a static snapshot
    const timeUntilMs = refreshManager.getTimeUntilRefresh(source.sourceId, source);
    breakers.push({
      name: `http-${source.sourceId}`,
      state: cb.state,
      isOpen: cb.isOpen,
      failureCount: cb.failureCount,
      timeUntilNextAttemptMs: timeUntilMs,
    });
  }

  const closed = breakers.filter((b) => b.state === 'CLOSED').length;
  const open = breakers.filter((b) => b.isOpen).length;
  const halfOpen = breakers.filter((b) => b.state === 'HALF_OPEN').length;
  const total = breakers.length;

  const overallHealth = open > 0 ? 'error' : halfOpen > 0 ? 'warning' : 'success';
  const healthColor = overallHealth === 'error' ? '#ff4d4f' : overallHealth === 'warning' ? '#faad14' : '#52c41a';

  const [isExpanded, setIsExpanded] = useState(false);

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
        left: 280,
        zIndex: 9999,
      };

  return (
    <>
      <div onClick={() => setIsExpanded(!isExpanded)} style={style}>
        Circuit Breaker:{' '}
        <span style={{ color: healthColor }}>
          {closed}/{total}
        </span>
      </div>

      {isExpanded && (
        <Card
          title={
            <Space>
              <SyncOutlined spin />
              <Text>Circuit Breaker Status</Text>
            </Space>
          }
          size="small"
          extra={<a onClick={() => setIsExpanded(false)}>Minimize</a>}
          style={{
            position: 'fixed',
            bottom: 50,
            right: 10,
            width: 350,
            maxHeight: 400,
            overflow: 'auto',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Space>
                <Badge status={overallHealth} />
                <Text strong>Overall Health</Text>
              </Space>
              <div style={{ marginTop: 8 }}>
                <Space size="small">
                  <Tag color="success">{closed} Closed</Tag>
                  {halfOpen > 0 && <Tag color="warning">{halfOpen} Half-Open</Tag>}
                  {open > 0 && <Tag color="error">{open} Open</Tag>}
                </Space>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Individual Breakers:
              </Text>
              <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
                {breakers.map((breaker) => {
                  const stateColor =
                    breaker.state === 'CLOSED' ? 'success' : breaker.state === 'HALF_OPEN' ? 'warning' : 'error';
                  return (
                    <div
                      key={breaker.name}
                      style={{
                        marginBottom: 12,
                        padding: 8,
                        backgroundColor: token.colorBgContainer,
                        borderRadius: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12 }}>{breaker.name}</Text>
                        <Badge status={stateColor} text={breaker.state} />
                      </div>
                      {breaker.failureCount > 0 && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Failures: {breaker.failureCount}
                        </Text>
                      )}
                      {breaker.isOpen && breaker.timeUntilNextAttemptMs > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Next attempt in {Math.round(breaker.timeUntilNextAttemptMs / 1000)}s
                          </Text>
                        </div>
                      )}
                    </div>
                  );
                })}
                {breakers.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    No HTTP sources
                  </Text>
                )}
              </div>
            </div>
          </Space>
        </Card>
      )}
    </>
  );
}
