/**
 * DOMPlayerContainer Component
 *
 * Container for the rrweb DOM playback player
 * Handles styling and positioning for the player
 *
 *  props - Component props
 *  props.playerContainerRef - Ref for the player container
 *  props.token - Ant Design theme token
 *  props.viewMode - Current view mode
 */

import type { GlobalToken } from 'antd/es/theme/interface';
import type React from 'react';

interface DOMPlayerContainerProps {
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  token: GlobalToken;
  viewMode: string;
}
const DOMPlayerContainer = ({ playerContainerRef, token, viewMode }: DOMPlayerContainerProps) => {
  if (viewMode !== 'dom') return null;

  return (
    <div
      ref={playerContainerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: token.colorBgLayout,
        borderRadius: '6px',
        border: `1px solid ${token.colorBorderSecondary}`,
        overflow: 'hidden',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
};

export default DOMPlayerContainer;
