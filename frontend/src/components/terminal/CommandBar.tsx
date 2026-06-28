import React, { useState, useEffect, useRef, memo } from 'react';
import { cleanSectorName } from '../../core/math';
import { useRrgStore } from '../../stores/useRrgStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import type { TimeframeItem, TrailItem } from '../../stores/useCommandBarStore';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import { useReplayStore } from '../../stores/useReplayStore';
import { SettingsModal } from '../settings/SettingsModal';
import { parseTimeframe, TimeUnit } from '../../core/TimeframeParser';
import './CommandBar.css';

const CommandBar: React.FC = memo(() => {
  const {
    timeframe, setTimeframe,
    trailLength, setTrailLength,
    timeframeItems, setTimeframeItems,
    trailItems, setTrailItems,
    showTrails, setShowTrails,
    normalized, setNormalized,
    intradayEnabled, setIntradayEnabled,
    liveStreamingEnabled, setLiveStreamingEnabled,
    replayModeEnabled, setReplayModeEnabled,
  } = useCommandBarStore();

  const { benchmark, setBenchmark } = useChartSettingsStore();
  const { replayDefaultApplied, setReplayDefaultApplied, sectors } = useRrgStore();
  const { setPlaybackState, setReplayCursor } = useReplayStore();

  // Reset transient replay state when replay mode is toggled off.
  useEffect(() => {
    if (!replayModeEnabled) {
      setReplayCursor(null);
      setPlaybackState('STOPPED');
      setReplayDefaultApplied(false);
    } else if (!replayDefaultApplied) {
      setReplayDefaultApplied(true);
    }
  }, [replayModeEnabled, replayDefaultApplied, setPlaybackState, setReplayCursor, setReplayDefaultApplied]);

  const [time, setTime] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customTrailPopupOpen, setCustomTrailPopupOpen] = useState(false);
  const [customTfPopupOpen, setCustomTfPopupOpen] = useState(false);
  const [customLen, setCustomLen] = useState<number>(10);
  const [customTfNum, setCustomTfNum] = useState<number>(45);
  const [customTfUnit, setCustomTfUnit] = useState<TimeUnit>(TimeUnit.MINUTE);
  const popupRef = useRef<HTMLDivElement>(null);
  const tfPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setCustomTrailPopupOpen(false);
      }
      if (tfPopupRef.current && !tfPopupRef.current.contains(event.target as Node)) {
        setCustomTfPopupOpen(false);
      }
    };
    if (customTrailPopupOpen || customTfPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [customTrailPopupOpen, customTfPopupOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: string) => {
    try {
      if (format === 'SVG') {
        const svgEl = document.getElementById('rrg-scene-svg');
        if (!svgEl) return;
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, 'rrg-export.svg');
      } else if (format === 'PNG') {
        const container = document.getElementById('rrg-scene-container');
        if (!container) return;
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(container);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'rrg-export.png';
        a.click();
      } else if (format === 'CSV') {
        const data = useRrgStore.getState().enrichedData;
        const header = 'symbol,x,y,quadrant,velocity\n';
        const rows = data.map((d: any) => `${d.symbol},${d.x},${d.y},${d.quadrant},${d.velocity || 0}`).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, 'rrg-export.csv');
      } else if (format === 'JSON') {
        const state = useRrgStore.getState();
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, 'rrg-state.json');
      }
    } catch (err) {
      console.error('Export failed', err);
    }
  };



  return (
    <>
    <div className="command-bar">
      <select 
        className="command-bar__benchmark" 
        value={benchmark || ''} 
        onChange={(e) => setBenchmark?.(e.target.value)}
      >
        {sectors?.map((s: string) => (
          <option key={s} value={s}>{cleanSectorName(s)}</option>
        ))}
      </select>

      <div className="command-bar__group command-bar__timeframe">
        <div ref={tfPopupRef} style={{ position: 'relative' }}>
          <button 
            className="command-bar__selector" 
            onClick={() => setCustomTfPopupOpen(!customTfPopupOpen)}
            title="Select Timeframe"
          >
            {timeframeItems.find(t => t.id === timeframe)?.label || timeframe} ▼
          </button>
          
          {customTfPopupOpen && (
            <div className="menu-popup">
              <div className="menu-add-custom">
                <input 
                  type="number" 
                  value={customTfNum} 
                  onChange={e => setCustomTfNum(parseInt(e.target.value) || 0)}
                  min={1}
                />
                <select 
                  value={customTfUnit} 
                  onChange={e => setCustomTfUnit(e.target.value as TimeUnit)}
                >
                  <option value={TimeUnit.MINUTE}>Minutes</option>
                  <option value={TimeUnit.HOUR}>Hours</option>
                  <option value={TimeUnit.DAY}>Days</option>
                  <option value={TimeUnit.WEEK}>Weeks</option>
                  <option value={TimeUnit.MONTH}>Months</option>
                </select>
                <button 
                  className="menu-add-btn"
                  onClick={() => {
                    const raw = `${customTfNum}${customTfUnit}`;
                    try {
                      const parsed = parseTimeframe(raw);
                      const existing = timeframeItems.find(t => t.id === parsed.canonical);
                      if (!existing) {
                        const newItem: TimeframeItem = {
                          id: parsed.canonical,
                          label: parsed.displayLabel.toUpperCase(),
                          minutes: parsed.minutes,
                          bookmarked: false,
                          system: false,
                          supported: true,
                          createdAt: new Date().toISOString()
                        };
                        setTimeframeItems([...timeframeItems, newItem]);
                      }
                      setTimeframe(parsed.canonical);
                      setCustomTfPopupOpen(false);
                    } catch (e: any) { alert(e.message); }
                  }}
                >
                  ADD
                </button>
              </div>

              {timeframeItems.some(t => t.bookmarked) && (
                <>
                  <div className="menu-section">Favorites</div>
                  {timeframeItems.filter(t => t.bookmarked).sort((a,b)=>a.minutes-b.minutes).map(t => (
                    <div key={t.id} className={`menu-item ${t.id === timeframe ? 'active' : ''}`} onClick={() => { setTimeframe(t.id); setCustomTfPopupOpen(false); }}>
                      <div className="menu-item-label">{t.label}</div>
                      <div className="menu-item-actions" onClick={e => e.stopPropagation()}>
                        {!t.system && (
                          <button className="menu-icon-btn" onClick={() => setTimeframeItems(timeframeItems.filter(i => i.id !== t.id))} title="Delete">🗑</button>
                        )}
                        <button className="menu-icon-btn favorite active" onClick={() => setTimeframeItems(timeframeItems.map(i => i.id === t.id ? { ...i, bookmarked: false } : i))} title="Remove Favorite">★</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="menu-section">Standard</div>
              {timeframeItems.filter(t => !t.bookmarked && t.system).sort((a,b)=>a.minutes-b.minutes).map(t => (
                <div key={t.id} className={`menu-item ${t.id === timeframe ? 'active' : ''}`} onClick={() => { setTimeframe(t.id); setCustomTfPopupOpen(false); }}>
                  <div className="menu-item-label">{t.label}</div>
                  <div className="menu-item-actions" onClick={e => e.stopPropagation()}>
                    <button className="menu-icon-btn favorite" onClick={() => setTimeframeItems(timeframeItems.map(i => i.id === t.id ? { ...i, bookmarked: true } : i))} title="Add Favorite">☆</button>
                  </div>
                </div>
              ))}

              {timeframeItems.some(t => !t.system && !t.bookmarked) && (
                <>
                  <div className="menu-section">Custom</div>
                  {timeframeItems.filter(t => !t.system && !t.bookmarked).sort((a,b)=>a.minutes-b.minutes).map(t => (
                    <div key={t.id} className={`menu-item ${t.id === timeframe ? 'active' : ''}`} onClick={() => { setTimeframe(t.id); setCustomTfPopupOpen(false); }}>
                      <div className="menu-item-label">{t.label}</div>
                      <div className="menu-item-actions" onClick={e => e.stopPropagation()}>
                        <button className="menu-icon-btn" onClick={() => setTimeframeItems(timeframeItems.filter(i => i.id !== t.id))} title="Delete">🗑</button>
                        <button className="menu-icon-btn favorite" onClick={() => setTimeframeItems(timeframeItems.map(i => i.id === t.id ? { ...i, bookmarked: true } : i))} title="Add Favorite">☆</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!replayModeEnabled && (
        <div className="command-bar__group command-bar__range">
          <div ref={popupRef} style={{ position: 'relative' }}>
            <button 
              className="command-bar__selector" 
              onClick={() => setCustomTrailPopupOpen(!customTrailPopupOpen)}
              title="Select Trail Length"
            >
              {trailItems.find(t => t.value === trailLength)?.value || trailLength} ▼
            </button>
            
            {customTrailPopupOpen && (
              <div className="menu-popup">
                <div className="menu-add-custom">
                  <input 
                    type="number" 
                    value={customLen} 
                    onChange={e => setCustomLen(parseInt(e.target.value) || 0)}
                    min={1}
                    max={500}
                    style={{ flex: 1 }}
                  />
                  <button 
                    className="menu-add-btn"
                    onClick={() => {
                      if (customLen > 0) {
                        const existing = trailItems.find(t => t.value === customLen);
                        if (!existing) {
                          const newItem: TrailItem = {
                            value: customLen,
                            bookmarked: false,
                            system: false,
                            createdAt: new Date().toISOString()
                          };
                          setTrailItems([...trailItems, newItem]);
                        }
                        setTrailLength(customLen);
                        setCustomTrailPopupOpen(false);
                      }
                    }}
                  >
                    ADD
                  </button>
                </div>

                {trailItems.some(t => t.bookmarked) && (
                  <>
                    <div className="menu-section">Favorites</div>
                    {trailItems.filter(t => t.bookmarked).sort((a,b)=>a.value-b.value).map(t => (
                      <div key={t.value} className={`menu-item ${t.value === trailLength ? 'active' : ''}`} onClick={() => { setTrailLength(t.value); setCustomTrailPopupOpen(false); }}>
                        <div className="menu-item-label">{t.value}</div>
                        <div className="menu-item-actions" onClick={e => e.stopPropagation()}>
                          {!t.system && (
                            <button className="menu-icon-btn" onClick={() => setTrailItems(trailItems.filter(i => i.value !== t.value))} title="Delete">🗑</button>
                          )}
                          <button className="menu-icon-btn favorite active" onClick={() => setTrailItems(trailItems.map(i => i.value === t.value ? { ...i, bookmarked: false } : i))} title="Remove Favorite">★</button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                <div className="menu-section">Standard</div>
                {trailItems.filter(t => !t.bookmarked && t.system).sort((a,b)=>a.value-b.value).map(t => (
                  <div key={t.value} className={`menu-item ${t.value === trailLength ? 'active' : ''}`} onClick={() => { setTrailLength(t.value); setCustomTrailPopupOpen(false); }}>
                    <div className="menu-item-label">{t.value}</div>
                    <div className="menu-item-actions" onClick={e => e.stopPropagation()}>
                      <button className="menu-icon-btn favorite" onClick={() => setTrailItems(trailItems.map(i => i.value === t.value ? { ...i, bookmarked: true } : i))} title="Add Favorite">☆</button>
                    </div>
                  </div>
                ))}

                {trailItems.some(t => !t.system && !t.bookmarked) && (
                  <>
                    <div className="menu-section">Custom</div>
                    {trailItems.filter(t => !t.system && !t.bookmarked).sort((a,b)=>a.value-b.value).map(t => (
                      <div key={t.value} className={`menu-item ${t.value === trailLength ? 'active' : ''}`} onClick={() => { setTrailLength(t.value); setCustomTrailPopupOpen(false); }}>
                        <div className="menu-item-label">{t.value}</div>
                        <div className="menu-item-actions" onClick={e => e.stopPropagation()}>
                          <button className="menu-icon-btn" onClick={() => setTrailItems(trailItems.filter(i => i.value !== t.value))} title="Delete">🗑</button>
                          <button className="menu-icon-btn favorite" onClick={() => setTrailItems(trailItems.map(i => i.value === t.value ? { ...i, bookmarked: true } : i))} title="Add Favorite">☆</button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <button 
        className={`command-bar__toggle ${showTrails ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setShowTrails(!showTrails)}
      >
        {showTrails ? '☑ TRAIL' : '☐ TRAIL'}
      </button>

      <button 
        className={`command-bar__toggle ${normalized ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setNormalized(!normalized)}
      >
        {normalized ? '☑ NORM' : '☐ NORM'}
      </button>

      <button 
        className={`command-bar__toggle ${intradayEnabled ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setIntradayEnabled(!intradayEnabled)}
      >
        {intradayEnabled ? '☑ INTRADAY' : '☐ INTRADAY'}
      </button>

      <button 
        className={`command-bar__toggle ${liveStreamingEnabled ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setLiveStreamingEnabled(!liveStreamingEnabled)}
        style={liveStreamingEnabled ? { color: '#00ff00', borderColor: '#00ff00' } : {}}
      >
        {liveStreamingEnabled ? '☑ LIVE' : '☐ LIVE'}
      </button>

      <button 
        className={`command-bar__toggle ${replayModeEnabled ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setReplayModeEnabled(!replayModeEnabled)}
      >
        {replayModeEnabled ? '☑ REPLAY' : '☐ REPLAY'}
      </button>


      <select 
        className="command-bar__export-btn" 
        onChange={(e) => {
          if (e.target.value) {
            handleExport(e.target.value);
            e.target.value = ''; // reset
          }
        }}
        value=""
        style={{ appearance: 'none', textAlign: 'center' }}
      >
        <option value="" disabled>EXPORT ▾</option>
        <option value="SVG">SVG</option>
        <option value="PNG">PNG</option>
        <option value="CSV">CSV</option>
        <option value="JSON">JSON</option>
      </select>

      <div className="command-bar__spacer" />

      <div className="command-bar__clock">
        {time}
      </div>

      <button
        id="cmd-settings-btn"
        className="command-bar__settings-btn"
        onClick={() => setSettingsOpen(true)}
        title="Chart Settings"
      >⚙ SETTINGS</button>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>

  </>
  );
});

export default CommandBar;
