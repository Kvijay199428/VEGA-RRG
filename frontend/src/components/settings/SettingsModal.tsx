import React, { useCallback, useEffect, useState } from 'react';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import type { TimeframeReplayConfig, ChartSettingsState } from '../../stores/useChartSettingsStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import type { CommandBarState } from '../../stores/useCommandBarStore';
import './SettingsModal.css';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// --- Sub-components ---

function ToggleRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <label className="settings-toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="settings-toggle__track" />
        <span className="settings-toggle__thumb" />
      </label>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, display, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control">
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="settings-slider"
        />
        <span className="settings-value-display">{display ?? value}</span>
      </div>
    </div>
  );
}

function SegmentRow({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control">
        {options.map(o => (
          <button
            key={o.value}
            className={`settings-btn ${value === o.value ? 'settings-btn--active' : ''}`}
            onClick={() => onChange(o.value)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// --- Main Modal ---

const CATEGORY_GROUPS = [
  {
    group: 'SYSTEM',
    categories: ['General', 'Cache', 'Advanced']
  },
  {
    group: 'CHART',
    categories: ['Rendering', 'Labels', 'Camera']
  },
  {
    group: 'ANALYSIS',
    categories: ['Replay', 'Watchlists', 'Optimization']
  },
  {
    group: 'LIVE',
    categories: ['Live Mode']
  },
  {
    group: 'DATA',
    categories: ['Historical Data', 'Benchmark Settings']
  }
];

export const SettingsModal: React.FC<SettingsModalProps> = React.memo(({ open, onClose }) => {
  const storeSettings = useChartSettingsStore();
  const storeCommandBar = useCommandBarStore();
  // unused: const { watchlist, toggleSector, selectAllSectors, clearAllSectors } = useRrgStore();

  const [activeCategory, setActiveCategory] = useState('Rendering');
  const [searchQuery, setSearchQuery] = useState('');

  // Draft state (cloned from store on open)
  const [draftSettings, setDraftSettings] = useState<Partial<ChartSettingsState>>({});
  const [draftCmd, setDraftCmd] = useState<Partial<CommandBarState>>({});
  
  // Dirty tracking for categories
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  // Initialization when opened
  useEffect(() => {
    if (open) {
      setDraftSettings({
        benchmark: storeSettings.benchmark,
        showLabels: storeSettings.showLabels,
        gridDensity: storeSettings.gridDensity,
        quadrantOpacity: storeSettings.quadrantOpacity,
        semanticZoom: storeSettings.semanticZoom,
        animationSpeed: storeSettings.animationSpeed,
        zoomSensitivity: storeSettings.zoomSensitivity,
        panSensitivity: storeSettings.panSensitivity,
        minZoom: storeSettings.minZoom,
        maxZoom: storeSettings.maxZoom,
        minimalWindowResampling: storeSettings.minimalWindowResampling,
        watchlistOnlyResampling: storeSettings.watchlistOnlyResampling,
        backgroundSnapshotRefresh: storeSettings.backgroundSnapshotRefresh,
        trailReplayConfig: JSON.parse(JSON.stringify(storeSettings.trailReplayConfig)),
      });
      setDraftCmd({
        timeframe: storeCommandBar.timeframe,
        trailLength: storeCommandBar.trailLength,
        normalized: storeCommandBar.normalized,
        showTrails: storeCommandBar.showTrails,
      });
      setDirtyFields(new Set());
    }
  }, [open, storeSettings.hydrated, storeCommandBar.hydrated]);

  const hasChanges = dirtyFields.size > 0;

  // Actions
  const handleApply = () => {
    if (hasChanges) {
      storeSettings.applyState(draftSettings);
      storeCommandBar.applyState(draftCmd);
    }
  };

  const handleSave = () => {
    handleApply();
    storeSettings.saveConfig();
    storeCommandBar.saveConfig();
    setDirtyFields(new Set());
    onClose();
  };

  const handleReset = () => {
    setDraftSettings({
      benchmark: storeSettings.benchmark,
      showLabels: storeSettings.showLabels,
      gridDensity: storeSettings.gridDensity,
      quadrantOpacity: storeSettings.quadrantOpacity,
      semanticZoom: storeSettings.semanticZoom,
      animationSpeed: storeSettings.animationSpeed,
      zoomSensitivity: storeSettings.zoomSensitivity,
      panSensitivity: storeSettings.panSensitivity,
      minZoom: storeSettings.minZoom,
      maxZoom: storeSettings.maxZoom,
      minimalWindowResampling: storeSettings.minimalWindowResampling,
      watchlistOnlyResampling: storeSettings.watchlistOnlyResampling,
      backgroundSnapshotRefresh: storeSettings.backgroundSnapshotRefresh,
      trailReplayConfig: JSON.parse(JSON.stringify(storeSettings.trailReplayConfig)),
    });
    setDraftCmd({
      timeframe: storeCommandBar.timeframe,
      trailLength: storeCommandBar.trailLength,
      normalized: storeCommandBar.normalized,
      showTrails: storeCommandBar.showTrails,
    });
    setDirtyFields(new Set());
  };

  const updateDraftSetting = <K extends keyof ChartSettingsState>(key: K, value: any, category: string) => {
    setDraftSettings(prev => ({ ...prev, [key]: value }));
    setDirtyFields(prev => { const n = new Set(prev); n.add(category); return n; });
  };

  const updateDraftCmd = <K extends keyof CommandBarState>(key: K, value: any, category: string) => {
    setDraftCmd(prev => ({ ...prev, [key]: value }));
    setDirtyFields(prev => { const n = new Set(prev); n.add(category); return n; });
  };

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;

  // --------------------------------------------------------------------------
  // Content Rendering Functions
  // --------------------------------------------------------------------------

  const renderRendering = () => (
    <div className="settings-section">
      <div className="settings-section__title">Rendering Settings</div>
      <ToggleRow label="Trails Enabled" checked={draftCmd.showTrails ?? true} onChange={v => updateDraftCmd('showTrails', v, 'Rendering')} />
      <ToggleRow label="Show Labels" checked={draftSettings.showLabels ?? true} onChange={v => updateDraftSetting('showLabels', v, 'Rendering')} />
      <ToggleRow label="Normalized Mode (100 Center)" checked={draftCmd.normalized ?? true} onChange={v => updateDraftCmd('normalized', v, 'Rendering')} />
      <SegmentRow
        label="Grid Density"
        value={draftSettings.gridDensity ?? 'normal'}
        options={[{ value: 'sparse', label: 'SPARSE' }, { value: 'normal', label: 'NORMAL' }, { value: 'dense', label: 'DENSE' }]}
        onChange={v => updateDraftSetting('gridDensity', v, 'Rendering')}
      />
      <SliderRow
        label="Quadrant Opacity"
        value={Math.round((draftSettings.quadrantOpacity ?? 0.22) * 100)}
        min={5} max={50} step={1}
        display={`${Math.round((draftSettings.quadrantOpacity ?? 0.22) * 100)}%`}
        onChange={v => updateDraftSetting('quadrantOpacity', v / 100, 'Rendering')}
      />
    </div>
  );

  const renderCamera = () => (
    <div className="settings-section">
      <div className="settings-section__title">Camera Settings</div>
      <ToggleRow label="Semantic Zoom (Adaptive Detail)" checked={draftSettings.semanticZoom ?? true} onChange={v => updateDraftSetting('semanticZoom', v, 'Camera')} />
      <SliderRow
        label="Animation Speed"
        value={draftSettings.animationSpeed ?? 1}
        min={0.25} max={4} step={0.25}
        display={`${draftSettings.animationSpeed ?? 1}x`}
        onChange={v => updateDraftSetting('animationSpeed', v, 'Camera')}
      />
      <SliderRow
        label="Zoom Sensitivity"
        value={draftSettings.zoomSensitivity ?? 0.1}
        min={0.05} max={0.5} step={0.05}
        display={String(draftSettings.zoomSensitivity ?? 0.1)}
        onChange={v => updateDraftSetting('zoomSensitivity', v, 'Camera')}
      />
      <SliderRow
        label="Pan Sensitivity"
        value={draftSettings.panSensitivity ?? 1.0}
        min={0.25} max={3} step={0.25}
        display={String(draftSettings.panSensitivity ?? 1.0)}
        onChange={v => updateDraftSetting('panSensitivity', v, 'Camera')}
      />
      <div className="settings-row">
        <span className="settings-row__label">Zoom Range (Min — Max)</span>
        <div className="settings-row__control" style={{ gap: 6 }}>
          <input
            type="number" min={0.3} max={1} step={0.1}
            value={draftSettings.minZoom ?? 0.8}
            onChange={e => updateDraftSetting('minZoom', parseFloat(e.target.value), 'Camera')}
            className="settings-input"
          />
          <span style={{ fontSize: 9, color: '#555' }}>—</span>
          <input
            type="number" min={2} max={20} step={1}
            value={draftSettings.maxZoom ?? 6.0}
            onChange={e => updateDraftSetting('maxZoom', parseFloat(e.target.value), 'Camera')}
            className="settings-input"
          />
        </div>
      </div>
    </div>
  );

  const renderOptimization = () => (
    <div className="settings-section">
      <div className="settings-section__title">Optimization Settings</div>
      <div className="settings-row" title="Optimized for live visualization performance. Replay/export modes automatically use full history.">
        <span className="settings-row__label">Minimal Window Resampling</span>
        <label className="settings-toggle">
          <input type="checkbox" checked={draftSettings.minimalWindowResampling ?? false} onChange={e => updateDraftSetting('minimalWindowResampling', e.target.checked, 'Optimization')} />
          <span className="settings-toggle__track" />
          <span className="settings-toggle__thumb" />
        </label>
      </div>
      <div className="settings-row" title="Only sectors currently in the watchlist will be resampled during timeframe changes to improve responsiveness.">
        <span className="settings-row__label">Optimize Timeframe Switching (Resample Watchlist Only)</span>
        <label className="settings-toggle">
          <input type="checkbox" checked={draftSettings.watchlistOnlyResampling ?? false} onChange={e => updateDraftSetting('watchlistOnlyResampling', e.target.checked, 'Optimization')} />
          <span className="settings-toggle__track" />
          <span className="settings-toggle__thumb" />
        </label>
      </div>
    </div>
  );

  const renderReplay = () => {
    const replayConfig = draftSettings.trailReplayConfig;
    if (!replayConfig) return null;

    return (
      <div className="settings-section">
        <div className="settings-section__title">Replay Settings</div>
        <ToggleRow
          label="Enable Replay Slider"
          checked={replayConfig.enabled}
          onChange={v => updateDraftSetting('trailReplayConfig', { ...replayConfig, enabled: v }, 'Replay')}
        />

        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="settings-replay-table">
            <thead>
              <tr>
                <th>Timeframe</th>
                <th>Range</th>
                <th>Unit</th>
                <th>Default Trail</th>
                <th>Max Trail</th>
                <th>Auto-Apply</th>
              </tr>
            </thead>
            <tbody>
              {(['MINUTE','HOUR','DAY','WEEK','MONTH'] as const).map(key => {
                const cfg: TimeframeReplayConfig = replayConfig.timeframeDateRanges?.[key] ?? {
                  rangeType: 'MONTH', rangeValue: 3, defaultTrailLength: 15, maxTrailLength: 120, autoApplyDefaultTrail: true
                };
                const update = (patch: Partial<TimeframeReplayConfig>) => {
                  updateDraftSetting('trailReplayConfig', {
                    ...replayConfig,
                    timeframeDateRanges: {
                      ...replayConfig.timeframeDateRanges,
                      [key]: { ...cfg, ...patch }
                    }
                  }, 'Replay');
                };
                return (
                  <tr key={key}>
                    <td className="settings-replay-table__key">{key}</td>
                    <td>
                      <input type="number" min={1} max={52} step={1} value={cfg.rangeValue}
                        onChange={e => update({ rangeValue: parseInt(e.target.value) })}
                        className="settings-input" style={{ width: 46 }} />
                    </td>
                    <td>
                      <div className="settings-row__control" style={{ gap: 3 }}>
                        {(['WEEK','MONTH','YEAR'] as const).map(rt => (
                          <button key={rt} className={`settings-btn ${cfg.rangeType === rt ? 'settings-btn--active' : ''}`}
                            style={{ fontSize: 9, padding: '2px 5px' }} onClick={() => update({ rangeType: rt })}>
                            {rt[0]}{rt.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <input type="number" min={1} max={cfg.maxTrailLength} step={1} value={cfg.defaultTrailLength}
                        onChange={e => update({ defaultTrailLength: parseInt(e.target.value) })}
                        className="settings-input" style={{ width: 46 }} />
                    </td>
                    <td>
                      <input type="number" min={cfg.defaultTrailLength} max={500} step={1} value={cfg.maxTrailLength}
                        onChange={e => update({ maxTrailLength: parseInt(e.target.value) })}
                        className="settings-input" style={{ width: 56 }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <label className="settings-toggle" style={{ margin: 'auto' }}>
                        <input type="checkbox" checked={cfg.autoApplyDefaultTrail} onChange={e => update({ autoApplyDefaultTrail: e.target.checked })} />
                        <span className="settings-toggle__track" />
                        <span className="settings-toggle__thumb" />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="settings-section__title" style={{ marginTop: 12, fontSize: 9, color: '#4a5870' }}>Session Persistence</div>
        <ToggleRow label="Restore last replay date on load"
          checked={replayConfig.replayDefaults?.restoreLastReplayDate ?? true}
          onChange={v => updateDraftSetting('trailReplayConfig', { ...replayConfig, replayDefaults: { ...replayConfig.replayDefaults, restoreLastReplayDate: v } }, 'Replay')} />
        <ToggleRow label="Remember last trail length"
          checked={replayConfig.replayDefaults?.rememberLastTrailLength ?? true}
          onChange={v => updateDraftSetting('trailReplayConfig', { ...replayConfig, replayDefaults: { ...replayConfig.replayDefaults, rememberLastTrailLength: v } }, 'Replay')} />
        <ToggleRow label="Remember playback speed"
          checked={replayConfig.replayDefaults?.rememberPlaybackSpeed ?? true}
          onChange={v => updateDraftSetting('trailReplayConfig', { ...replayConfig, replayDefaults: { ...replayConfig.replayDefaults, rememberPlaybackSpeed: v } }, 'Replay')} />
      </div>
    );
  };

  const renderStub = (name: string, fields: string[]) => (
    <div className="settings-section" style={{ opacity: 0.6 }}>
      <div className="settings-section__title">{name} Settings</div>
      <div style={{ fontSize: 10, color: '#FF9900', marginBottom: 16, background: 'rgba(255,153,0,0.1)', padding: '6px 10px', borderRadius: 4 }}>
        Reserved for Future Configuration
      </div>
      {fields.map(f => (
        <div key={f} className="settings-row" style={{ opacity: 0.5, pointerEvents: 'none' }}>
          <span className="settings-row__label">{f}</span>
          <label className="settings-toggle">
            <input type="checkbox" checked={false} onChange={() => {}} />
            <span className="settings-toggle__track" />
            <span className="settings-toggle__thumb" />
          </label>
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    switch (activeCategory) {
      case 'Rendering': return renderRendering();
      case 'Camera': return renderCamera();
      case 'Optimization': return renderOptimization();
      case 'Replay': return renderReplay();
      
      case 'General': return renderStub('General', ['Auto Save Settings', 'Restore Previous Session', 'Remember Selected Benchmark', 'Remember Watchlists']);
      case 'Labels': return renderStub('Labels', ['Adaptive Labels', 'Show Quadrant Labels', 'Show Sector Labels', 'Collision Detection']);
      case 'Watchlists': return renderStub('Watchlists', ['Default Watchlist', 'Auto Load Watchlist', 'Remember Last Watchlist']);
      case 'Live Mode': return renderStub('Live Mode', ['Live Refresh Rate', 'WebSocket Auto Connect', 'Show Provisional Points', 'Live Trail Length']);
      case 'Cache': return renderStub('Cache', ['Snapshot Cache Size', 'Historical Trail Cache Size', 'Clear Cache']);
      case 'Advanced': return renderStub('Advanced', ['Export Settings', 'Import Settings', 'Configuration Diagnostics']);
      case 'Historical Data': return renderStub('Historical Data', ['Historical Lookback', 'Warmup Period']);
      case 'Benchmark Settings': return renderStub('Benchmark Settings', ['Default Benchmark', 'Custom Baseline']);
      default: return null;
    }
  };

  // --------------------------------------------------------------------------

  return (
    <div className="settings-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Chart Settings">

        {/* Header */}
        <div className="settings-modal__header">
          <span className="settings-modal__title">⚙ Chart Settings</span>
          <button className="settings-modal__close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-modal__body">
          
          {/* Sidebar */}
          <div className="settings-sidebar">
            <div className="settings-sidebar__search">
              <input 
                type="text" 
                placeholder="Search settings..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            {CATEGORY_GROUPS.map(group => {
              const visibleCategories = group.categories.filter(c => c.toLowerCase().includes(searchQuery.toLowerCase()));
              if (visibleCategories.length === 0) return null;

              return (
                <div key={group.group} className="settings-sidebar__group">
                  <div className="settings-sidebar__group-title">{group.group}</div>
                  {visibleCategories.map(cat => (
                    <div 
                      key={cat} 
                      className={`settings-sidebar__item ${activeCategory === cat ? 'settings-sidebar__item--active' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      <span>{cat}</span>
                      {dirtyFields.has(cat) && <span className="settings-sidebar__unsaved" title="Unsaved changes">●</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Content Area */}
          <div className="settings-content">
            {renderContent()}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="settings-modal__footer">
          <button 
            className="settings-footer-btn" 
            disabled={!hasChanges}
            onClick={handleReset}
          >
            Reset
          </button>
          <div style={{ flex: 1 }}></div>
          <button 
            className="settings-footer-btn" 
            disabled={!hasChanges}
            onClick={handleApply}
          >
            Apply
          </button>
          <button 
            className="settings-footer-btn settings-footer-btn--primary" 
            disabled={!hasChanges}
            onClick={handleSave}
          >
            Save
          </button>
        </div>

      </div>
    </div>
  );
});

export default SettingsModal;
