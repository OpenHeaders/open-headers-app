import { DeleteOutlined } from '@ant-design/icons';
import type React from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface DeleteConfirmOverlayProps {
  pendingDeleteIndex: number;
  itemName: string;
}

const DeleteConfirmOverlay: React.FC<DeleteConfirmOverlayProps> = ({ pendingDeleteIndex, itemName }) => {
  const [targetRow, setTargetRow] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pendingDeleteIndex < 0) {
      setTargetRow(null);
      return;
    }
    const activePane = document.querySelector('.ant-tabs-tabpane-active') ?? document;
    const rows = activePane.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
    const row = rows[pendingDeleteIndex] as HTMLElement | undefined;
    setTargetRow(row ?? null);
  }, [pendingDeleteIndex]);

  if (pendingDeleteIndex < 0 || !targetRow) return null;

  const displayName =
    itemName.length > 24 ? `${itemName.substring(0, 18)}...${itemName.substring(itemName.length - 4)}` : itemName;

  return createPortal(
    <div className="delete-confirm-overlay">
      <DeleteOutlined style={{ fontSize: 13, color: '#ff4d4f' }} />
      <span className="delete-confirm-name">Delete "{displayName}"?</span>
      <div className="delete-confirm-actions">
        <span className="delete-confirm-action delete-action">
          <span className="kbd-key" style={{ fontSize: 10, minWidth: 18 }}>
            d
          </span>
          <span>confirm</span>
        </span>
        <div className="delete-confirm-divider" />
        <span className="delete-confirm-action">
          <span className="kbd-key" style={{ fontSize: 10, minWidth: 28 }}>
            esc
          </span>
          <span>cancel</span>
        </span>
      </div>
    </div>,
    targetRow,
  );
};

export default DeleteConfirmOverlay;
