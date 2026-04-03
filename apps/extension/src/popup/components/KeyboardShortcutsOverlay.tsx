import { isFirefox } from '@utils/browser-api';
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
  combo?: boolean;
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
  hint?: { label: string; onClick: () => void };
}

const LEFT_COLUMN: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['1'], description: 'This Page tab' },
      { keys: ['2'], description: 'All Rules tab' },
      { keys: ['3'], description: 'Tags tab' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['[', ']'], description: 'Prev / next page' },
      { keys: ['Esc'], description: 'Clear search / deselect' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['a'], description: 'Add new rule' },
      { keys: ['r'], description: 'Toggle recording' },
      { keys: ['p'], description: 'Pause / resume rules' },
      { keys: ['o'], description: 'Options menu' },
      { keys: ['t'], description: 'Cycle theme' },
      { keys: ['m'], description: 'Compact mode' },
      { keys: ['?'], description: 'This panel' },
    ],
  },
];

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const RIGHT_COLUMN: ShortcutGroup[] = [
  {
    title: 'Table rows',
    shortcuts: [
      { keys: ['j', '\u2193'], description: 'Move down' },
      { keys: ['k', '\u2191'], description: 'Move up' },
      { keys: ['l', '\u2192'], description: 'Expand / enter sub-rows' },
      { keys: ['h', '\u2190'], description: 'Collapse / exit sub-rows' },
      { keys: ['Space'], description: 'Toggle on / off' },
      { keys: ['e'], description: 'Edit rule' },
      { keys: ['c'], description: 'Copy value' },
      { keys: ['dd'], description: 'Delete (press twice)' },
    ],
  },
  {
    title: 'Browser',
    shortcuts: [
      { keys: isMac ? ['\u2318', '\u21E7', '.'] : ['Ctrl', 'Shift', '.'], combo: true, description: 'Open popup' },
    ],
    hint: {
      label: 'Customize browser shortcut \u2197',
      onClick: () => {
        if (isFirefox) {
          void chrome.tabs.create({ url: 'about:addons' });
        } else {
          void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        }
      },
    },
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
                      {shortcut.combo ? '+' : '/'}
                    </Text>
                  )}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </span>
            <Text style={{ fontSize: '12px' }}>{shortcut.description}</Text>
          </div>
        ))}
        {group.hint && (
          <span
            className="keyboard-shortcuts-customize-link"
            role="button"
            tabIndex={0}
            onClick={group.hint.onClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') group.hint!.onClick();
            }}
          >
            {group.hint.label}
          </span>
        )}
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
          <Text strong style={{ fontSize: '14px' }}>
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
