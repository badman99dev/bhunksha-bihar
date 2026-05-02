'use client';

import { useState, useEffect, useRef } from 'react';

const LEVEL_LABELS = ['District', 'Sub Division', 'Circle', 'Mauza', 'Survey Type', 'Map Instance', 'Sheet No'];

const RESOLUTION_OPTIONS = [
  { value: 800, label: 'Low', sub: '800px', warn: false },
  { value: 2000, label: '2K', sub: '2000px', warn: false },
  { value: 4000, label: '4K', sub: '4000px', warn: false },
  { value: 8000, label: '8K', sub: '8000px', warn: true, msg: '⚠️ Slow download' },
  { value: 16000, label: '16K', sub: '16000px', warn: true, msg: '⚠️ Very slow! May fail' },
];

const DPI_OPTIONS = [
  { value: 90, label: '90', sub: 'Screen' },
  { value: 150, label: '150', sub: 'Draft' },
  { value: 300, label: '300', sub: 'Print' },
  { value: 420, label: '420', sub: 'HQ' },
  { value: 600, label: '600', sub: 'Ultra' },
];

interface LevelOption { code: string; label: string }

function parseLevelData(arr: any[]): LevelOption[] {
  const opts: LevelOption[] = [];
  for (const item of arr) {
    if (item.extraParms?.hasData) {
      let l = '';
      if (item.toStringIsCode) l = item.code;
      else if (item.toStringIsValue) l = item.value;
      else l = `${item.code} ${item.value}`;
      opts.push({ code: item.code, label: l });
    }
  }
  return opts;
}

type Phase = 'idle' | 'fetching' | 'cropping' | 'removing' | 'upscaling' | 'ready' | 'error';

export default function Home() {
  const [selections, setSelections] = useState<string[]>(Array(7).fill(''));
  const [options, setOptions] = useState<LevelOption[][]>(Array(7).fill(null).map(() => []));
  const [loading, setLoading] = useState<boolean[]>(Array(7).fill(false));
  const [resolution, setResolution] = useState(4000);
  const [dpi, setDpi] = useState(420);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [analyzeData, setAnalyzeData] = useState<any>(null);
  const [highResBlob, setHighResBlob] = useState<Blob | null>(null);
  const [cropStyle, setCropStyle] = useState<React.CSSProperties>({});
  const [bgBlack, setBgBlack] = useState(false);
  const [upscaleText, setUpscaleText] = useState('');
  const fetchIdRef = useRef(0);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchLevels(0, []); }, []);

  async function fetchLevels(fromLevel: number, parentSelections: string[]) {
    const fid = ++fetchIdRef.current;
    setLoading(p => { const n = [...p]; for (let i = fromLevel; i < 7; i++) n[i] = true; return n; });
    try {
      const codes = parentSelections.filter(c => c !== '').join(',');
      const res = await fetch(`/api/levels?state=10&level=${fromLevel}&codes=${codes}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (fetchIdRef.current !== fid) return;
      if (Array.isArray(data) && data.length > 0) {
        const parsed: LevelOption[][] = data.map((d: any) => Array.isArray(d) ? parseLevelData(d) : []);
        setOptions(p => { const n = [...p]; for (let i = fromLevel; i < 7; i++) n[i] = parsed[i - fromLevel] || []; return n; });
        setSelections(p => {
          const n = [...p];
          for (let i = 0; i < fromLevel; i++) n[i] = p[i];
          for (let i = fromLevel; i < 7; i++) { const o = parsed[i - fromLevel]; n[i] = o?.length === 1 ? o[0].code : ''; }
          return n;
        });
      }
    } catch (e) { console.error(e); }
    finally { if (fetchIdRef.current === fid) setLoading(p => { const n = [...p]; for (let i = fromLevel; i < 7; i++) n[i] = false; return n; }); }
  }

  function handleSelect(level: number, value: string) {
    resetPreview();
    setSelections(p => { const n = [...p]; n[level] = value; for (let i = level + 1; i < 7; i++) n[i] = ''; return n; });
    setOptions(p => { const n = [...p]; for (let i = level + 1; i < 7; i++) n[i] = []; return n; });
    if (value) {
      const s = [...selections]; s[level] = value; for (let i = level + 1; i < 7; i++) s[i] = '';
      fetchLevels(level + 1, s.slice(0, level + 1));
    }
  }

  function resetPreview() {
    setPhase('idle');
    setAnalyzeData(null);
    setHighResBlob(null);
    setBgBlack(false);
    setCropStyle({});
    setUpscaleText('');
    setErrorMsg('');
  }

  async function handleStart() {
    resetPreview();
    setPhase('fetching');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels: selections, state: '10', dpi }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Analyze failed'); }
      const data = await res.json();
      setAnalyzeData(data);

      // Phase: show low-res
      setPhase('cropping');

      // Animate crop after short delay
      await sleep(300);
      setCropStyle({
        clipPath: `inset(${data.cropPct.top}% ${data.cropPct.right}% ${data.cropPct.bottom}% ${data.cropPct.left}%)`,
        transition: 'clip-path 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
      });

      await sleep(1500);

      // Phase: removing background
      setPhase('removing');
      setBgBlack(true);
      await sleep(1500);

      // Phase: upscaling
      setPhase('upscaling');
      const resLabel = RESOLUTION_OPTIONS.find(r => r.value === resolution)?.label || `${resolution}px`;
      setUpscaleText(`Upscaling to ${resLabel}...`);

      // Start high-res download in parallel
      const dlRes = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gisCode: data.gisCode, state: '10', tightBBOX: data.tightBBOX, resolution, dpi, aspectRatio: data.aspectRatio }),
      });
      if (!dlRes.ok) { const e = await dlRes.json(); throw new Error(e.error || 'Download failed'); }

      const blob = await dlRes.blob();
      setHighResBlob(blob);
      setUpscaleText(`Upscaled to ${resLabel} ✅`);

      await sleep(800);
      setPhase('ready');

    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message);
    }
  }

  function handleDownload() {
    if (!highResBlob) return;
    const url = URL.createObjectURL(highResBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bhunaksha_${analyzeData?.gisCode || 'map'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const allSelected = selections.every(s => s !== '');
  const selectedRes = RESOLUTION_OPTIONS.find(r => r.value === resolution);
  const showViewer = phase !== 'idle';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: "'Segoe UI', system-ui, sans-serif", color: '#e0e0e0' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '12px' }}>BhuNaksha Bihar</div>
          <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', margin: '0 0 8px', lineHeight: 1.1 }}>Map Downloader</h1>
          <p style={{ color: '#6b7280', fontSize: '15px' }}>Select location → Download high-quality village map</p>
        </div>

        {/* Location */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '28px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: '#4b5563', marginBottom: '20px' }}>Location</div>
          {LEVEL_LABELS.map((label, i) => {
            const en = i === 0 || selections[i - 1] !== '';
            const lb = loading[i];
            const ho = options[i].length > 0;
            return (
              <div key={i} style={{ marginBottom: i < 6 ? '16px' : 0 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: en ? '#9ca3af' : '#374151', marginBottom: '6px' }}>{label}</label>
                <div style={{ position: 'relative' }}>
                  <select value={selections[i]} onChange={e => handleSelect(i, e.target.value)} disabled={!en || lb} style={{
                    width: '100%', padding: '10px 14px',
                    background: en ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${en ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                    borderRadius: '8px', color: en ? '#e0e0e0' : '#374151', fontSize: '14px', outline: 'none', appearance: 'none', cursor: en ? 'pointer' : 'not-allowed',
                  }}>
                    <option value="">{lb ? 'Loading...' : en && ho ? `-- Select ${label} --` : ''}</option>
                    {options[i].map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                  {en && ho && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280', fontSize: '10px' }}>▼</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quality */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '28px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: '#4b5563', marginBottom: '20px' }}>Quality</div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#9ca3af', marginBottom: '10px' }}>Resolution</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {RESOLUTION_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setResolution(o.value)} style={{
                  padding: '8px 4px', background: resolution === o.value ? (o.warn ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)') : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${resolution === o.value ? (o.warn ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.4)') : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '6px', color: resolution === o.value ? (o.warn ? '#fbbf24' : '#60a5fa') : '#6b7280', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{o.label}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>{o.sub}</div>
                </button>
              ))}
            </div>
            {selectedRes?.warn && <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '6px', color: '#fbbf24', fontSize: '12px' }}>{selectedRes.msg}</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#9ca3af', marginBottom: '10px' }}>DPI</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {DPI_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setDpi(o.value)} style={{
                  padding: '8px 4px', background: dpi === o.value ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${dpi === o.value ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '6px', color: dpi === o.value ? '#a78bfa' : '#6b7280', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{o.label}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>{o.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start / Download Button */}
        {!showViewer && (
          <button onClick={handleStart} disabled={!allSelected} style={{
            width: '100%', padding: '14px',
            background: allSelected ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.05)',
            color: allSelected ? '#fff' : '#374151',
            border: `1px solid ${allSelected ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: allSelected ? 'pointer' : 'not-allowed', transition: 'all 0.3s',
          }}>
            {allSelected ? `📥 Generate ${selectedRes?.label || ''} Map` : 'Select all levels to continue'}
          </button>
        )}

        {/* MAP VIEWER - The magic happens here */}
        {showViewer && (
          <div style={{
            marginTop: '24px',
            background: bgBlack ? '#000' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${bgBlack ? '#111' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'background 0.8s ease',
          }}>
            {/* Phase indicator */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#4b5563', marginBottom: '4px' }}>
                  {phase === 'fetching' ? 'Step 1 of 3' : phase === 'cropping' ? 'Step 2 of 3' : phase === 'removing' ? 'Step 3 of 3' : phase === 'upscaling' ? 'Finalizing' : phase === 'ready' ? 'Complete' : 'Error'}
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: phase === 'ready' ? '#34d399' : phase === 'error' ? '#f87171' : '#e0e0e0' }}>
                  {phase === 'fetching' && '📡 Fetching map from BhuNaksha...'}
                  {phase === 'cropping' && `✂️ Detecting content — ${analyzeData?.blankPct}% blank removed`}
                  {phase === 'removing' && '🎨 Removing background...'}
                  {phase === 'upscaling' && upscaleText}
                  {phase === 'ready' && '✅ Map ready!'}
                  {phase === 'error' && `❌ ${errorMsg}`}
                </div>
              </div>
              {phase !== 'ready' && phase !== 'error' && (
                <div style={{
                  width: '20px', height: '20px',
                  border: '2px solid rgba(59,130,246,0.3)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
              )}
            </div>

            {/* Image area */}
            <div ref={viewerRef} style={{
              position: 'relative',
              minHeight: '320px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}>
              {/* Low-res preview with crop animation */}
              {analyzeData?.lowResImage && phase !== 'ready' && (
                <div style={{
                  position: 'relative',
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <img
                    src={analyzeData.lowResImage}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '400px',
                      objectFit: 'contain',
                      ...cropStyle,
                      filter: (phase === 'removing' || phase === 'upscaling') ? 'blur(4px) brightness(0.4)' : 'none',
                      transition: `${cropStyle.transition || ''}, filter 0.8s ease`,
                    }}
                  />
                  {/* Overlay text during upscaling */}
                  {(phase === 'upscaling') && (
                    <div style={{
                      position: 'absolute',
                      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                    }}>
                      <div style={{
                        fontSize: '28px', fontWeight: '700', color: '#60a5fa',
                        textShadow: '0 0 20px rgba(59,130,246,0.5)',
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }}>
                        {upscaleText}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Final high-res preview */}
              {phase === 'ready' && highResBlob && (
                <img
                  src={URL.createObjectURL(highResBlob)}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '500px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    animation: 'fadeInUp 0.6s ease-out',
                  }}
                />
              )}

              {/* Fetching spinner */}
              {phase === 'fetching' && !analyzeData && (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                }}>
                  <div style={{
                    width: '40px', height: '40px', margin: '0 auto 16px',
                    border: '3px solid rgba(59,130,246,0.2)',
                    borderTopColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>Connecting to BhuNaksha server...</div>
                </div>
              )}
            </div>

            {/* Download button */}
            {phase === 'ready' && (
              <div style={{ padding: '0 20px 20px' }}>
                <button onClick={handleDownload} style={{
                  width: '100%', padding: '14px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', border: 'none', borderRadius: '10px',
                  fontSize: '16px', fontWeight: '700', cursor: 'pointer',
                  transition: 'all 0.3s',
                  animation: 'fadeInUp 0.5s ease-out',
                }}>
                  💾 Download Map
                </button>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div style={{ padding: '0 20px 20px' }}>
                <button onClick={handleStart} style={{
                  width: '100%', padding: '12px',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px', color: '#f87171', fontSize: '14px', cursor: 'pointer',
                }}>
                  🔄 Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* Back button when in viewer */}
        {showViewer && phase === 'ready' && (
          <button onClick={resetPreview} style={{
            width: '100%', padding: '12px', marginTop: '12px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px', color: '#6b7280', fontSize: '14px', cursor: 'pointer',
          }}>
            ← Download another map
          </button>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
