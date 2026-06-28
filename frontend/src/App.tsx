import CommandBar from './components/terminal/CommandBar';
import WatchlistPanel from './components/terminal/WatchlistPanel';
import StatusBar from './components/terminal/StatusBar';
import MetricsPanel from './components/MetricsPanel';
import RankingPanel from './components/RankingPanel';
import ReplayTimelinePanel from './components/terminal/ReplayTimelinePanel';
import { RrgScene } from './components/chart/RrgScene';
import { useCommandBarStore } from './stores/useCommandBarStore';
import { useAutoFetch } from './hooks/useAutoFetch';
import { useReplaySession } from './hooks/useReplaySession';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useChartSettingsStore } from './stores/useChartSettingsStore';
import { useReplayStore } from './stores/useReplayStore';
import { useEffect } from 'react';

import './index.css';
import './App.css';

function App() {
  const replayModeEnabled = useCommandBarStore(s => (s as any).replayModeEnabled);

  // Initialize auto-fetching, replay engine, live WebSocket, and keyboard shortcuts
  useAutoFetch();
  useReplaySession();
  useWebSocket();
  useKeyboardShortcuts();

  useEffect(() => {
    useCommandBarStore.getState().loadConfig();
    useChartSettingsStore.getState().loadConfig();
    useReplayStore.getState().loadConfig();
  }, []);

  return (
    <div className="app">
      <div className="app__command">
        <CommandBar />
      </div>
      
      <div className="app__left">
        <RankingPanel />
        <MetricsPanel />
      </div>
      
      <div className="app__chart">
        {replayModeEnabled && <ReplayTimelinePanel />}
        <RrgScene />
      </div>

      <div className="app__watchlist">
        <WatchlistPanel />
      </div>
      
      <div className="app__status">
        <StatusBar />
      </div>
    </div>
  );
}

export default App;
