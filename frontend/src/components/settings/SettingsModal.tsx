import React, { useCallback } from 'react';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { useRrgStore } from '../../stores/useRrgStore';
import { cleanSectorName } from '../../core/math';
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

export const SettingsModal: React.FC<SettingsModalProps> = React.memo(({ open, onClose }) => {
  const settings = useChartSettingsStore();
  const commandBar = useCommandBarStore();
  const { watchlist, toggleSector, selectAllSectors, clearAllSectors } = useRrgStore();

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;

  const enabledCount = watchlist.filter(w => w.enabled).length;

  return (
    <div className="settings-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Chart Settings">

        {/* Header */}
        <div className="settings-modal__header">
          <span className="settings-modal__title">⚙ Chart Settings</span>
          <button className="settings-modal__close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-modal__body">

          {/* GENERAL */}
          <div className="settings-section">
            <div className="settings-section__title">General</div>

            <SegmentRow
              label="Timeframe"
              value={commandBar.timeframe}
              options={[
                { value: '1d', label: 'DAY' },
                { value: '1w', label: 'WEEK' },
                { value: '1mo', label: 'MONTH' },
              ]}
              onChange={v => commandBar.setTimeframe(v as any)}
            />

            <div className="settings-row">
              <span className="settings-row__label">Trail Length (Global)</span>
              <div className="settings-row__control">
                {[5, 10, 15, 20, 25, 30].map(l => (
                  <button
                    key={l}
                    className={`settings-btn ${commandBar.trailLength === l ? 'settings-btn--active' : ''}`}
                    onClick={() => commandBar.setTrailLength(l)}
                  >{l}</button>
                ))}
              </div>
            </div>

            <ToggleRow
              label="Normalize RRG (100 Center)"
              checked={commandBar.normalized}
              onChange={commandBar.setNormalized}
            />
          </div>

          {/* VISUALS */}
          <div className="settings-section">
            <div className="settings-section__title">Visuals</div>

            <ToggleRow
              label="Show Trails"
              checked={commandBar.showTrails}
              onChange={commandBar.setShowTrails}
            />

            <SliderRow
              label="Animation Speed"
              value={settings.animationSpeed}
              min={0.25} max={4} step={0.25}
              display={`${settings.animationSpeed}x`}
              onChange={settings.setAnimationSpeed}
            />
          </div>

          {/* OPTIMIZATIONS */}
          <div className="settings-section">
            <div className="settings-section__title">Optimizations</div>
            <div className="settings-row" title="Optimized for live visualization performance. Replay/export modes automatically use full history.">
              <span className="settings-row__label">Minimal Window Resampling</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.minimalWindowResampling} onChange={e => settings.setMinimalWindowResampling(e.target.checked)} />
                <span className="settings-toggle__track" />
                <span className="settings-toggle__thumb" />
              </label>
            </div>
            <div className="settings-row" title="Only sectors currently in the watchlist will be resampled during timeframe changes to improve responsiveness.">
              <span className="settings-row__label">Optimize Timeframe Switching (Resample Watchlist Only)</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.watchlistOnlyResampling} onChange={e => settings.setWatchlistOnlyResampling(e.target.checked)} />
                <span className="settings-toggle__track" />
                <span className="settings-toggle__thumb" />
              </label>
            </div>
          </div>

          {/* VISUAL */}
          <div className="settings-section">
            <div className="settings-section__title">Visual</div>
            <ToggleRow label="Show Trails" checked={commandBar.showTrails} onChange={commandBar.setShowTrails} />
            <ToggleRow label="Show Labels" checked={settings.showLabels} onChange={settings.setShowLabels} />
            <ToggleRow label="Normalized Mode" checked={commandBar.normalized} onChange={commandBar.setNormalized} />
            <SegmentRow
              label="Grid Density"
              value={settings.gridDensity}
              options={[
                { value: 'sparse', label: 'SPARSE' },
                { value: 'normal', label: 'NORMAL' },
                { value: 'dense', label: 'DENSE' },
              ]}
              onChange={v => settings.setGridDensity(v as any)}
            />
            <SliderRow
              label="Quadrant Opacity"
              value={Math.round(settings.quadrantOpacity * 100)}
              min={5} max={50} step={1}
              display={`${Math.round(settings.quadrantOpacity * 100)}%`}
              onChange={v => settings.setQuadrantOpacity(v / 100)}
            />
          </div>

          {/* SECTORS */}
          <div className="settings-section">
            <div className="settings-section__title">Sectors</div>
            <div className="settings-sector-header">
              <span className="settings-sector-count">{enabledCount} / {watchlist.length} ACTIVE</span>
              <div className="settings-sector-actions">
                <button className="settings-btn" onClick={selectAllSectors}>ALL</button>
                <button className="settings-btn" onClick={clearAllSectors}>NONE</button>
              </div>
            </div>
            <div className="settings-sector-grid">
              {watchlist.map(w => (
                <button
                  key={w.symbol}
                  className={`settings-sector-btn ${w.enabled ? 'settings-sector-btn--active' : ''}`}
                  onClick={() => toggleSector(w.symbol)}
                  title={cleanSectorName(w.symbol)}
                >
                  {cleanSectorName(w.symbol)}
                </button>
              ))}
            </div>
          </div>

          {/* VIEWPORT */}
          <div className="settings-section">
            <div className="settings-section__title">Viewport</div>
            <SliderRow
              label="Zoom Sensitivity"
              value={settings.zoomSensitivity}
              min={0.05} max={0.5} step={0.05}
              display={String(settings.zoomSensitivity)}
              onChange={settings.setZoomSensitivity}
            />
            <SliderRow
              label="Pan Sensitivity"
              value={settings.panSensitivity}
              min={0.25} max={3} step={0.25}
              display={String(settings.panSensitivity)}
              onChange={settings.setPanSensitivity}
            />
            <div className="settings-row">
              <span className="settings-row__label">Zoom Range (Min — Max)</span>
              <div className="settings-row__control" style={{ gap: 6 }}>
                <input
                  type="number" min={0.3} max={1} step={0.1}
                  value={settings.minZoom}
                  onChange={e => settings.setMinZoom(parseFloat(e.target.value))}
                  className="settings-input"
                />
                <span style={{ fontSize: 9, color: '#555' }}>—</span>
                <input
                  type="number" min={2} max={20} step={1}
                  value={settings.maxZoom}
                  onChange={e => settings.setMaxZoom(parseFloat(e.target.value))}
                  className="settings-input"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="settings-modal__footer">
          <button className="settings-footer-btn" onClick={settings.resetDefaults}>RESET DEFAULTS</button>
          <button className="settings-footer-btn settings-footer-btn--primary" onClick={onClose}>APPLY</button>
        </div>

      </div>
    </div>
  );
});
