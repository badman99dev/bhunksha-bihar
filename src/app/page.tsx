'use client';

import { useState, useEffect, useCallback } from 'react';

const LEVEL_LABELS = [
  'District',
  'Sub Division',
  'Circle',
  'Mauza',
  'Survey Type',
  'Map Instance',
  'Sheet No'
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

  const fetchLevels = useCallback(async (fromLevel: number, parentSelections: string[]) => {
    const newLoading = [...loading];
    for (let i = fromLevel; i < 7; i++) newLoading[i] = true;
    setLoading(newLoading);

    try {
      const codes = parentSelections.filter(c => c !== '').join(',');
      const res = await fetch(`/api/levels?state=10&level=${fromLevel}&codes=${codes}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const newOptions = [...options];
        for (let i = fromLevel; i < 7; i++) {
          const dataIdx = i - fromLevel;
          if (dataIdx < data.length && Array.isArray(data[dataIdx])) {
            const parsed = parseLevelData(data[dataIdx]);
            newOptions[i] = parsed;
            if (parsed.length === 1) {
              const newSels = [...parentSelections];
              for (let j = fromLevel; j < i; j++) {
                if (!newSels[j] && newOptions[j].length > 0) {
                  newSels[j] = newOptions[j][0].code;
                }
              }
              newSels[i] = parsed[0].code;
            }
          } else {
            newOptions[i] = [];
          }
        }
        setOptions(newOptions);

        const newSels = [...selections];
        for (let i = fromLevel; i < 7; i++) {
          if (newOptions[i].length === 1) {
            newSels[i] = newOptions[i][0].code;
          }
        }
        setSelections(newSels);
      }
    } catch (e) {
      console.error(`Failed to fetch levels from ${fromLevel}:`, e);
    } finally {
      const doneLoading = [...loading];
      for (let i = fromLevel; i < 7; i++) doneLoading[i] = false;
      setLoading(doneLoading);
    }
  }, [options, selections, loading]);

  useEffect(() => {
    fetchLevels(0, []);
  }, []);

  const handleSelect = (level: number, value: string) => {
    const newSelections = [...selections];
    newSelections[level] = value;
    for (let i = level + 1; i < 7; i++) {
      newSelections[i] = '';
    }
    setSelections(newSelections);

    const newOptions = [...options];
    for (let i = level + 1; i < 7; i++) {
      newOptions[i] = [];
    }
    setOptions(newOptions);

    if (value) {
      fetchLevels(level + 1, newSelections.slice(0, level + 1));
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    setStatus('Resolving GIS code from BhuNaksha...');

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels: selections, state: '10' }),
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
  };

  const allSelected = selections.every(s => s !== '');

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
                  transition: 'color 0.2s',
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
                      transition: 'all 0.2s',
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
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#6b7280',
                      fontSize: '10px',
                    }}>▼</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

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
          {downloading ? '⏳ Processing...' : allSelected ? '📥 Download High-Quality Map' : 'Select all levels to download'}
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
            <li>Server auto-resolves GIS code &amp; map extent from BhuNaksha</li>
            <li>Downloads low-res scan, analyzes pixel content bounds</li>
            <li>Downloads &amp; crops high-quality 4000px map</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
