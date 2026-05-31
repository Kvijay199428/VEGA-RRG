import React, { useState, useEffect, useRef, memo } from 'react';
import { cleanSectorName } from '../../core/math';
import { useRrgStore } from '../../stores/useRrgStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import { SettingsModal } from '../settings/SettingsModal';
import { parseTimeframe, TimeUnit } from '../../core/TimeframeParser';
import './CommandBar.css';

const CommandBar: React.FC = memo(() => {
  const {
    timeframe, setTimeframe,
    trailLength, setTrailLength,
    bookmarkedTrailLengths, setBookmarkedTrailLengths,
    bookmarkedTimeframes, setBookmarkedTimeframes,
    recentTimeframes,
    showTrails, setShowTrails,
    normalized, setNormalized,
  } = useCommandBarStore();

  const { benchmark, setBenchmark } = useChartSettingsStore();
  const { sectors, isPlaying, setIsPlaying } = useRrgStore();

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
        {bookmarkedTimeframes.map(tfValue => {
          let label = tfValue;
          let isActive = timeframe === tfValue;
          try {
            label = parseTimeframe(tfValue).displayLabel.toUpperCase();
            isActive = parseTimeframe(timeframe).canonical === parseTimeframe(tfValue).canonical;
          } catch {}
          return (
            <button
              key={tfValue}
              className={`command-bar__segment-btn ${isActive ? 'command-bar__segment-btn--active' : ''}`}
              onClick={() => setTimeframe(tfValue)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (bookmarkedTimeframes.length > 1) {
                  setBookmarkedTimeframes(bookmarkedTimeframes.filter(x => x !== tfValue));
                }
              }}
              title="Right-click to remove bookmark"
            >
              {label}
            </button>
          );
        })}
        <div ref={tfPopupRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="command-bar__segment-btn"
            onClick={() => setCustomTfPopupOpen(!customTfPopupOpen)}
            style={{ fontWeight: 'bold' }}
            title="Add Custom Timeframe"
          >
            +
          </button>
          {customTfPopupOpen && (
            <div className="command-bar__popup" style={{
              position: 'absolute', top: '100%', left: '0', 
              background: '#111', border: '1px solid #333', 
              padding: '8px', zIndex: 100, display: 'flex', gap: '4px',
              marginTop: '4px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              flexDirection: 'column', width: '220px'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input 
                  type="number" 
                  value={customTfNum} 
                  onChange={e => setCustomTfNum(parseInt(e.target.value) || 0)}
                  style={{ width: '50px', background: '#222', color: '#fff', border: '1px solid #444', textAlign: 'center', borderRadius: '2px' }}
                  min={1}
                />
                <select 
                  value={customTfUnit} 
                  onChange={e => setCustomTfUnit(e.target.value as TimeUnit)}
                  style={{ flex: 1, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '2px' }}
                >
                  <option value={TimeUnit.MINUTE}>Minutes</option>
                  <option value={TimeUnit.HOUR}>Hours</option>
                  <option value={TimeUnit.DAY}>Days</option>
                  <option value={TimeUnit.WEEK}>Weeks</option>
                  <option value={TimeUnit.MONTH}>Months</option>
                  <option value={TimeUnit.YEAR}>Years</option>
                </select>
                <button 
                  onClick={() => {
                    const raw = `${customTfNum}${customTfUnit}`;
                    try {
                      const parsed = parseTimeframe(raw);
                      if (!bookmarkedTimeframes.includes(parsed.canonical)) {
                        setBookmarkedTimeframes([...bookmarkedTimeframes, parsed.canonical]);
                      }
                      setTimeframe(parsed.canonical);
                      setCustomTfPopupOpen(false);
                    } catch (e: any) {
                      alert(e.message);
                    }
                  }}
                  style={{ background: '#333', border: '1px solid #444', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '2px', fontSize: '10px' }}
                >
                  ADD
                </button>
              </div>
              {recentTimeframes.length > 0 && (
                <div style={{ marginTop: '8px', borderTop: '1px solid #333', paddingTop: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>RECENT</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {recentTimeframes.map(rtf => (
                      <button key={rtf} onClick={() => {
                        setTimeframe(rtf);
                        if (!bookmarkedTimeframes.includes(rtf)) setBookmarkedTimeframes([...bookmarkedTimeframes, rtf]);
                        setCustomTfPopupOpen(false);
                      }} style={{ background: '#222', border: '1px solid #444', color: '#ccc', fontSize: '10px', padding: '2px 4px', cursor: 'pointer', borderRadius: '2px' }}>
                        {rtf}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="command-bar__group command-bar__range">
        {bookmarkedTrailLengths.map(len => (
          <button
            key={len}
            className={`command-bar__segment-btn ${trailLength === len ? 'command-bar__segment-btn--active' : ''}`}
            onClick={() => setTrailLength?.(len)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (bookmarkedTrailLengths.length > 1) {
                setBookmarkedTrailLengths(bookmarkedTrailLengths.filter(x => x !== len));
              }
            }}
            title="Right-click to remove bookmark"
          >
            {len}
          </button>
        ))}
        <div ref={popupRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="command-bar__segment-btn"
            onClick={() => setCustomTrailPopupOpen(!customTrailPopupOpen)}
            style={{ fontWeight: 'bold' }}
            title="Add Custom Trail"
          >
            +
          </button>
          {customTrailPopupOpen && (
            <div className="command-bar__popup" style={{
              position: 'absolute', top: '100%', left: '0', 
              background: '#111', border: '1px solid #333', 
              padding: '8px', zIndex: 100, display: 'flex', gap: '4px',
              marginTop: '4px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <input 
                type="number" 
                value={customLen} 
                onChange={e => setCustomLen(parseInt(e.target.value) || 0)}
                style={{ width: '50px', background: '#222', color: '#fff', border: '1px solid #444', textAlign: 'center', borderRadius: '2px' }}
                min={1}
                max={500}
              />
              <button 
                onClick={() => {
                  if (customLen > 0) setTrailLength(customLen);
                  setCustomTrailPopupOpen(false);
                }}
                style={{ background: '#333', border: '1px solid #444', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '2px', fontSize: '10px' }}
              >
                APPLY
              </button>
              <button 
                onClick={() => {
                  if (customLen > 0 && !bookmarkedTrailLengths.includes(customLen)) {
                    setBookmarkedTrailLengths([...bookmarkedTrailLengths, customLen].sort((a,b)=>a-b));
                    setTrailLength(customLen);
                    setCustomTrailPopupOpen(false);
                  }
                }}
                style={{ background: '#2c3e50', border: '1px solid #34495e', color: '#fff', cursor: 'pointer', padding: '2px 8px', fontSize: '10px', borderRadius: '2px' }}
                title="Bookmark this length"
              >
                ★
              </button>
            </div>
          )}
        </div>
      </div>

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

      <div className="command-bar__playback">
        <button className="command-bar__playback-btn" onClick={() => {}}>⏮</button>
        <button className="command-bar__playback-btn" onClick={() => setIsPlaying?.(!isPlaying)}>
          {isPlaying ? '⏸' : '⏯'}
        </button>
        <button className="command-bar__playback-btn" onClick={() => {}}>⏭</button>
      </div>

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
  );
});

export default CommandBar;
