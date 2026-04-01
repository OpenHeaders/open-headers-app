import { Typography } from 'antd';
import type React from 'react';
import { useEffect, useRef } from 'react';

const { Text } = Typography;

interface KeyboardShortcutsOverlayProps {
  visible: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const LEFT_COLUMN: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['1'], description: 'Switch to Active tab' },
      { keys: ['2'], description: 'Switch to Rules tab' },
      { keys: ['3'], description: 'Switch to Tags tab' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['['], description: 'Previous page' },
      { keys: [']'], description: 'Next page' },
      { keys: ['Esc'], description: 'Clear search / deselect row' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['a'], description: 'Add new rule' },
      { keys: ['r'], description: 'Toggle recording' },
      { keys: ['p'], description: 'Pause / resume rules' },
      { keys: ['t'], description: 'Cycle theme (light / dark / auto)' },
      { keys: ['m'], description: 'Toggle compact mode' },
      { keys: ['?'], description: 'Show / hide this panel' },
    ],
  },
];

const RIGHT_COLUMN: ShortcutGroup[] = [
  {
    title: 'Table rows',
    shortcuts: [
      { keys: ['j', '\u2193'], description: 'Move down' },
      { keys: ['k', '\u2191'], description: 'Move up' },
      { keys: ['l', '\u2192'], description: 'Expand / enter sub-rows' },
      { keys: ['h', '\u2190'], description: 'Collapse / exit sub-rows' },
      { keys: ['Space'], description: 'Toggle rule on / off' },
      { keys: ['e'], description: 'Edit rule in desktop app' },
      { keys: ['c'], description: 'Copy value' },
      { keys: ['dd'], description: 'Delete rule (press twice)' },
    ],
  },
];

const Kbd: React.FC<{ children: string }> = ({ children }) => <span className="kbd-key">{children}</span>;

const ShortcutColumn: React.FC<{ groups: ShortcutGroup[] }> = ({ groups }) => (
  <div className="keyboard-shortcuts-column">
    {groups.map((group) => (
      <div key={group.title} className="keyboard-shortcuts-group">
        <Text type="secondary" className="keyboard-shortcuts-group-title">
          {group.title}
        </Text>
        {group.shortcuts.map((shortcut) => (
          <div key={shortcut.description} className="keyboard-shortcut-row">
            <span className="keyboard-shortcut-keys">
              {shortcut.keys.map((key, i) => (
                <span key={key}>
                  {i > 0 && (
                    <Text type="secondary" style={{ fontSize: '10px', margin: '0 2px' }}>
                      /
                    </Text>
                  )}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </span>
            <Text style={{ fontSize: '12px' }}>{shortcut.description}</Text>
          </div>
        ))}
      </div>
    ))}
  </div>
);

const KeyboardShortcutsOverlay: React.FC<KeyboardShortcutsOverlayProps> = ({ visible, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="keyboard-shortcuts-backdrop">
      <div className="keyboard-shortcuts-overlay" ref={overlayRef}>
        <div className="keyboard-shortcuts-header">
          <Text strong style={{ fontSize: '15px' }}>
            Keyboard Shortcuts
          </Text>
          <span className="keyboard-shortcuts-close">
            <Text type="secondary" style={{ fontSize: '11px' }}>
              press
            </Text>
            <Kbd>Esc</Kbd>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              or
            </Text>
            <Kbd>?</Kbd>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              to close
            </Text>
          </span>
        </div>
        <div className="keyboard-shortcuts-body">
          <ShortcutColumn groups={LEFT_COLUMN} />
          <div className="keyboard-shortcuts-divider" />
          <ShortcutColumn groups={RIGHT_COLUMN} />
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsOverlay;
