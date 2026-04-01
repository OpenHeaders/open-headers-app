import { CheckOutlined, CopyTwoTone } from '@ant-design/icons';
import { Space, Tag, Tooltip, Typography } from 'antd';
import type React from 'react';

const { Text } = Typography;

export interface TagDescriptor {
  label: string;
  color?: string;
  tooltip?: string;
}

export function renderDomainTags(domains: string[], showAllDomains = true): React.ReactNode {
  if (!domains || domains.length === 0) {
    return showAllDomains ? (
      <Tag variant="outlined" color="default">
        All domains
      </Tag>
    ) : null;
  }
  const first = domains[0].length > 14 ? `${domains[0].substring(0, 14)}...` : domains[0];
  const overflowCount = domains.length - 1;
  const tooltip = (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {domains.map((d, i) => (
        <div key={i}>
          <span style={{ opacity: 0.6 }}>{i + 1}. </span>
          {d}
        </div>
      ))}
    </div>
  );
  return (
    <Tooltip title={tooltip} styles={{ root: { maxWidth: 500 } }}>
      <Space size={2}>
        <Tag variant="outlined" style={{ fontSize: '12px', cursor: 'default', margin: 0 }}>
          {first}
        </Tag>
        {overflowCount > 0 && (
          <Tag variant="outlined" style={{ fontSize: '12px', cursor: 'default', margin: 0 }}>
            +{overflowCount}
          </Tag>
        )}
      </Space>
    </Tooltip>
  );
}

export function renderValueWithCopy({
  fullValue,
  displayValue,
  rowKey,
  copiedRowId,
  setCopiedRowId,
  opacity = 1,
}: {
  fullValue: string;
  displayValue: string;
  rowKey: string | number;
  copiedRowId: string | number | null;
  setCopiedRowId: (id: string | number | null) => void;
  opacity?: number;
}): React.ReactNode {
  return (
    <div
      className="value-cell"
      style={{ display: 'flex', alignItems: 'center', gap: 4, opacity, whiteSpace: 'nowrap', overflow: 'hidden' }}
    >
      <Text style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayValue}</Text>
      {fullValue &&
        (copiedRowId === rowKey ? (
          <CheckOutlined
            className="value-copy-icon"
            style={{ fontSize: '12px', color: '#52c41a', flexShrink: 0, opacity: 1 }}
          />
        ) : (
          <CopyTwoTone
            className="value-copy-icon"
            style={{ fontSize: '12px', cursor: 'pointer', flexShrink: 0, opacity: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(fullValue);
              setCopiedRowId(rowKey);
              setTimeout(() => setCopiedRowId(null), 1000);
            }}
          />
        ))}
    </div>
  );
}

export function renderTagOverflow(allTags: TagDescriptor[], maxVisible: number): React.ReactNode {
  const tagStyle = { margin: 0, fontSize: '11px' };
  const visible = allTags.slice(0, maxVisible);
  const overflowCount = allTags.length - maxVisible;

  return (
    <Space size={2}>
      {visible.map((t, i) =>
        t.tooltip ? (
          <Tooltip key={i} title={t.tooltip}>
            <Tag color={t.color} variant="outlined" style={{ ...tagStyle, cursor: 'help' }}>
              {t.label}
            </Tag>
          </Tooltip>
        ) : (
          <Tag key={i} color={t.color} variant="outlined" style={tagStyle}>
            {t.label}
          </Tag>
        ),
      )}
      {overflowCount > 0 && (
        <Tooltip
          title={
            <div style={{ fontSize: 12 }}>
              {allTags.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: i < allTags.length - 1 ? 4 : 0,
                  }}
                >
                  <span style={{ opacity: 0.6 }}>{i + 1}. </span>
                  <Tag color={t.color} variant="outlined" style={{ margin: 0, fontSize: '11px' }}>
                    {t.label}
                  </Tag>
                </div>
              ))}
            </div>
          }
          styles={{ root: { maxWidth: 400 } }}
        >
          <Tag variant="outlined" style={{ ...tagStyle, cursor: 'help' }}>
            +{overflowCount}
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
}

export function truncateValue(value: string, maxLen = 16): string {
  if (value.length <= maxLen) return value;
  return `${value.substring(0, 9)}...${value.substring(value.length - 4)}`;
}
