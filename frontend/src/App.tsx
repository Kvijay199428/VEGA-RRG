import CommandBar from './components/terminal/CommandBar';
import WatchlistPanel from './components/terminal/WatchlistPanel';
import StatusBar from './components/terminal/StatusBar';
import MetricsPanel from './components/MetricsPanel';
import RankingPanel from './components/RankingPanel';
import { RrgScene } from './components/chart/RrgScene';
import { useAutoFetch } from './hooks/useAutoFetch';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import './index.css';
import './App.css';

function App() {
  // Initialize auto-fetching and keyboard shortcuts
  useAutoFetch();
  useKeyboardShortcuts();

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
