'use client';

import { useState, useEffect, useRef } from 'react';

const LEVEL_LABELS = [
  'District',
  'Sub Division',
  'Circle',
  'Mauza',
  'Survey Type',
  'Map Instance',
  'Sheet No'
];

const RESOLUTION_OPTIONS = [
  { value: 800, label: 'Low Quality', sub: '800px', warn: false },
  { value: 2000, label: '2K', sub: '2000px', warn: false },
  { value: 4000, label: '4K', sub: '4000px', warn: false },
  { value: 8000, label: '8K', sub: '8000px', warn: true, msg: '⚠️ Slow download & heavy processing' },
  { value: 16000, label: '16K', sub: '16000px', warn: true, msg: '⚠️ Very slow! May fail on large maps' },
];

const DPI_OPTIONS = [
  { value: 90, label: '90 DPI', sub: 'Screen' },
  { value: 150, label: '150 DPI', sub: 'Draft Print' },
  { value: 300, label: '300 DPI', sub: 'Standard Print' },
  { value: 420, label: '420 DPI', sub: 'High Quality' },
  { value: 600, label: '600 DPI', sub: 'Ultra Print' },
];

interface LevelOption {
  code: string;
  label: string;
}

function parseLevelData(levelArr: any[]): LevelOption[] {
  const opts: LevelOption[] = [];
  for (const item of levelArr) {
    if (item.extraParms?.hasData) {
      let label = '';
      if (item.toStringIsCode) label = item.code;
      else if (item.toStringIsValue) label = item.value;
      else label = `${item.code} ${item.value}`;
      opts.push({ code: item.code, label });
    }
  }
  return opts;
}

export default function Home() {
  const [selections, setSelections] = useState<string[]>(Array(7).fill(''));
  const [options, setOptions] = useState<LevelOption[][]>(Array(7).fill(null).map(() => []));
  const [loading, setLoading] = useState<boolean[]>(Array(7).fill(false));
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState(4000);
  const [dpi, setDpi] = useState(420);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    fetchLevels(0, []);
  }, []);

  async function fetchLevels(fromLevel: number, parentSelections: string[]) {
    const thisFetchId = ++fetchIdRef.current;

    setLoading(prev => {
      const next = [...prev];
      for (let i = fromLevel; i < 7; i++) next[i] = true;
      return next;
    });

    try {
      const codes = parentSelections.filter(c => c !== '').join(',');
      const res = await fetch(`/api/levels?state=10&level=${fromLevel}&codes=${codes}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      if (fetchIdRef.current !== thisFetchId) return;

      if (Array.isArray(data) && data.length > 0) {
        const parsedAll: LevelOption[][] = [];
        for (let i = 0; i < data.length; i++) {
          parsedAll.push(Array.isArray(data[i]) ? parseLevelData(data[i]) : []);
        }

        setOptions(prev => {
          const next = [...prev];
          for (let i = fromLevel; i < 7; i++) {
            const dataIdx = i - fromLevel;
            next[i] = dataIdx < parsedAll.length ? parsedAll[dataIdx] : [];
          }
          return next;
        });

        setSelections(prev => {
          const next = [...prev];
          for (let i = 0; i < fromLevel; i++) next[i] = prev[i];
          for (let i = fromLevel; i < 7; i++) {
            const dataIdx = i - fromLevel;
            const opts = dataIdx < parsedAll.length ? parsedAll[dataIdx] : [];
            next[i] = opts.length === 1 ? opts[0].code : '';
          }
          return next;
        });
      }
    } catch (e) {
      console.error(`Failed to fetch levels from ${fromLevel}:`, e);
    } finally {
      if (fetchIdRef.current === thisFetchId) {
        setLoading(prev => {
          const next = [...prev];
          for (let i = fromLevel; i < 7; i++) next[i] = false;
          return next;
        });
      }
    }
  }

  function handleSelect(level: number, value: string) {
    setSelections(prev => {
      const next = [...prev];
      next[level] = value;
      for (let i = level + 1; i < 7; i++) next[i] = '';
      return next;
    });
    setOptions(prev => {
      const next = [...prev];
      for (let i = level + 1; i < 7; i++) next[i] = [];
      return next;
    });
    if (value) {
      const currentSels = [...selections];
      currentSels[level] = value;
      for (let i = level + 1; i < 7; i++) currentSels[i] = '';
      fetchLevels(level + 1, currentSels.slice(0, level + 1));
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError('');
    setStatus('Resolving GIS code from BhuNaksha...');

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels: selections, state: '10', resolution, dpi }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Download failed');
      }

      setStatus('Downloading high-quality map...');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const gisCode = response.headers.get('X-GIS-Code') || 'map';
      a.download = `bhunaksha_${gisCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setStatus(`Done! GIS: ${gisCode} ✅`);
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    } finally {
      setDownloading(false);
    }
  }

  const allSelected = selections.every(s => s !== '');
  const selectedRes = RESOLUTION_OPTIONS.find(r => r.value === resolution);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#e0e0e0',
    }}>
      <div style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '40px 20px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{
            fontSize: '13px',
            letterSpacing: '6px',
            textTransform: 'uppercase',
            color: '#6b7280',
            marginBottom: '12px',
          }}>BhuNaksha Bihar</div>
          <h1 style={{
            fontSize: '36px',
            fontWeight: '700',
            color: '#fff',
            margin: '0 0 8px',
            lineHeight: 1.1,
          }}>Map Downloader</h1>
          <p style={{ color: '#6b7280', fontSize: '15px' }}>
            Select location → Download high-quality village map
          </p>
        </div>

        {/* Location Section */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '11px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: '#4b5563',
            marginBottom: '20px',
          }}>Location</div>

          {LEVEL_LABELS.map((label, i) => {
            const isEnabled = i === 0 || selections[i - 1] !== '';
            const isLoading = loading[i];
            const hasOpts = options[i].length > 0;

            return (
              <div key={i} style={{ marginBottom: i < 6 ? '16px' : 0 }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: isEnabled ? '#9ca3af' : '#374151',
                  marginBottom: '6px',
                }}>
                  {label}
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={selections[i]}
                    onChange={(e) => handleSelect(i, e.target.value)}
                    disabled={!isEnabled || isLoading}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: isEnabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isEnabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                      borderRadius: '8px',
                      color: isEnabled ? '#e0e0e0' : '#374151',
                      fontSize: '14px',
                      outline: 'none',
                      appearance: 'none',
                      cursor: isEnabled ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <option value="">
                      {isLoading ? 'Loading...' : isEnabled && hasOpts ? `-- Select ${label} --` : ''}
                    </option>
                    {options[i].map((opt) => (
                      <option key={opt.code} value={opt.code}>{opt.label}</option>
                    ))}
                  </select>
                  {isEnabled && hasOpts && (
                    <div style={{
                      position: 'absolute', right: '12px', top: '50%',
                      transform: 'translateY(-50%)', pointerEvents: 'none',
                      color: '#6b7280', fontSize: '10px',
                    }}>▼</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quality Settings */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '24px',
        }}>
          <div style={{
            fontSize: '11px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: '#4b5563',
            marginBottom: '20px',
          }}>Quality Settings</div>

          {/* Resolution */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#9ca3af',
              marginBottom: '10px',
            }}>
              Resolution
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
            }}>
              {RESOLUTION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setResolution(opt.value)}
                  style={{
                    padding: '8px 4px',
                    background: resolution === opt.value
                      ? (opt.warn ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)')
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${resolution === opt.value
                      ? (opt.warn ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.4)')
                      : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '6px',
                    color: resolution === opt.value
                      ? (opt.warn ? '#fbbf24' : '#60a5fa')
                      : '#6b7280',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{opt.label}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {selectedRes?.warn && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: '6px',
                color: '#fbbf24',
                fontSize: '12px',
              }}>
                {selectedRes.msg}
              </div>
            )}
          </div>

          {/* DPI */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#9ca3af',
              marginBottom: '10px',
            }}>
              DPI (Print Quality)
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
            }}>
              {DPI_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDpi(opt.value)}
                  style={{
                    padding: '8px 4px',
                    background: dpi === opt.value
                      ? 'rgba(139,92,246,0.15)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${dpi === opt.value
                      ? 'rgba(139,92,246,0.4)'
                      : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '6px',
                    color: dpi === opt.value ? '#a78bfa' : '#6b7280',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{opt.label}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={!allSelected || downloading}
          style={{
            width: '100%',
            padding: '14px',
            background: allSelected && !downloading
              ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
              : 'rgba(255,255,255,0.05)',
            color: allSelected && !downloading ? '#fff' : '#374151',
            border: `1px solid ${allSelected && !downloading ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: allSelected && !downloading ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s',
          }}
        >
          {downloading ? '⏳ Processing...' : allSelected ? `📥 Download ${selectedRes?.label || ''} Map` : 'Select all levels to download'}
        </button>

        {status && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '8px',
            color: '#60a5fa',
            textAlign: 'center',
            fontSize: '14px',
          }}>
            {status}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '8px',
            color: '#f87171',
            textAlign: 'center',
            fontSize: '14px',
          }}>
            ❌ {error}
          </div>
        )}

        <div style={{
          marginTop: '36px',
          padding: '20px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: '10px',
        }}>
          <div style={{
            fontSize: '11px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#374151',
            marginBottom: '12px',
          }}>How it works</div>
          <ol style={{
            margin: 0,
            paddingLeft: '20px',
            lineHeight: '2',
            fontSize: '13px',
            color: '#6b7280',
          }}>
            <li>Select District → Sub Div → Circle → Mauza → Survey → Map → Sheet</li>
            <li>Choose resolution &amp; DPI quality</li>
            <li>Server auto-resolves GIS code &amp; map extent</li>
            <li>Smart crops &amp; delivers high-quality map</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
