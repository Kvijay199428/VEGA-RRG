import React, { memo } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import './StatusBar.css';

const StatusBar: React.FC = memo(() => {
  const {
    connectionStatus,
    lastUpdate,
    latency,
    quadrantDistribution
  } = useRrgStore();

  const getStatusClass = () => {
    switch (connectionStatus) {
      case 'CONNECTED': return 'status-bar__dot--connected';
      case 'DISCONNECTED': return 'status-bar__dot--disconnected';
      case 'RECONNECTING': return 'status-bar__dot--reconnecting';
      default: return 'status-bar__dot--disconnected';
    }
  };

  const l = quadrantDistribution?.leading || 0;
  const w = quadrantDistribution?.weakening || 0;
  const la = quadrantDistribution?.lagging || 0;
  const i = quadrantDistribution?.improving || 0;
  const total = l + w + la + i;
  const getPct = (val: number) => total > 0 ? Math.round((val / total) * 100) : 0;

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        <div className={`status-bar__dot ${getStatusClass()}`} />
        <span className="status-bar__connection">{connectionStatus || 'DISCONNECTED'}</span>
      </div>

      <div className="status-bar__center">
        {connectionStatus === 'CONNECTED' && (
          <span className="status-bar__live">
            <span className="status-bar__live-dot" /> LIVE
          </span>
        )}
      </div>

      <div className="status-bar__right">
        <div className="status-bar__info">
          LAST UPDATE: {lastUpdate || '---'} | LATENCY: {latency != null ? `${latency}ms` : '---'}
        </div>
        
        <div className="status-bar__breadth">
          <span style={{ color: 'var(--quadrant-leading-text, var(--quadrant-leading, #0f0))' }}>L:{getPct(l)}%</span>
          <span style={{ color: 'var(--quadrant-weakening-text, var(--quadrant-weakening, #ff0))' }}>W:{getPct(w)}%</span>
          <span style={{ color: 'var(--quadrant-lagging-text, var(--quadrant-lagging, #f00))' }}>I:{getPct(la)}%</span>
          <span style={{ color: 'var(--quadrant-improving-text, var(--quadrant-improving, #00f))' }}>G:{getPct(i)}%</span>
        </div>
      </div>
    </div>
  );
});

export default StatusBar;
