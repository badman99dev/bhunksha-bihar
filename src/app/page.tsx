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

const STEPS = [
  { key: 'fetching', num: '1', label: 'Fetch Map' },
  { key: 'cropping', num: '2', label: 'Smart Crop' },
  { key: 'removing', num: '3', label: 'Remove BG' },
  { key: 'upscaling', num: '4', label: 'Upscale' },
];

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
  const [upscalePct, setUpscalePct] = useState(0);
  const fetchIdRef = useRef(0);

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
    setPhase('idle'); setAnalyzeData(null); setHighResBlob(null);
    setBgBlack(false); setCropStyle({}); setUpscaleText(''); setUpscalePct(0); setErrorMsg('');
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

      setPhase('cropping');
      await sleep(600);
      setCropStyle({
        clipPath: `inset(${data.cropPct.top}% ${data.cropPct.right}% ${data.cropPct.bottom}% ${data.cropPct.left}%)`,
        transition: 'clip-path 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      });

      await sleep(2000);
      setPhase('removing');
      setBgBlack(true);
      await sleep(1800);

      setPhase('upscaling');
      const resLabel = RESOLUTION_OPTIONS.find(r => r.value === resolution)?.label || `${resolution}px`;
      setUpscaleText(resLabel);

      // Animate percentage
      for (let p = 0; p <= 100; p += 3) {
        setUpscalePct(p);
        await sleep(50);
      }
      setUpscalePct(100);

      const dlRes = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gisCode: data.gisCode, state: '10', tightBBOX: data.tightBBOX, resolution, dpi, aspectRatio: data.aspectRatio }),
      });
      if (!dlRes.ok) { const e = await dlRes.json(); throw new Error(e.error || 'Download failed'); }
      const blob = await dlRes.blob();
      setHighResBlob(blob);
      await sleep(600);
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
  const activeStepIdx = STEPS.findIndex(s => s.key === phase);

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

        {/* Generate Button */}
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

        {/* ===== MAP VIEWER ===== */}
        {showViewer && (
          <div style={{
            marginTop: '24px',
            background: bgBlack ? '#000' : '#08080d',
            border: `1px solid ${bgBlack ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'all 1s ease',
            boxShadow: bgBlack ? '0 0 40px rgba(16,185,129,0.08)' : 'none',
          }}>

            {/* Step Progress Bar */}
            <div style={{ padding: '16px 20px 12px' }}>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {STEPS.map((step, idx) => {
                  const isActive = idx === activeStepIdx;
                  const isDone = idx < activeStepIdx || phase === 'ready';
                  const isPending = idx > activeStepIdx;
                  return (
                    <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{
                        width: '100%', height: '3px',
                        background: isDone ? '#10b981' : isActive ? 'linear-gradient(90deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.06)',
                        borderRadius: '2px',
                        transition: 'all 0.5s ease',
                        ...(isActive ? { animation: 'shimmer 1.5s ease-in-out infinite' } : {}),
                      }} />
                      <div style={{
                        fontSize: '10px', fontWeight: '600',
                        color: isDone ? '#10b981' : isActive ? '#60a5fa' : '#374151',
                        transition: 'color 0.3s',
                        letterSpacing: '0.5px',
                      }}>
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status Text */}
            <div style={{ padding: '4px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '15px', fontWeight: '600',
                  color: phase === 'ready' ? '#34d399' : phase === 'error' ? '#f87171' : '#e0e0e0',
                  transition: 'color 0.3s',
                }}>
                  {phase === 'fetching' && '📡 Fetching map from BhuNaksha...'}
                  {phase === 'cropping' && `✂️ Smart crop — ${analyzeData?.blankPct}% blank removed`}
                  {phase === 'removing' && '🎨 Removing background...'}
                  {phase === 'upscaling' && `⚡ Upscaling to ${upscaleText}...`}
                  {phase === 'ready' && '✅ Map ready!'}
                  {phase === 'error' && `❌ ${errorMsg}`}
                </div>
                {phase === 'upscaling' && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{
                      width: '100%', height: '4px',
                      background: 'rgba(59,130,246,0.1)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${upscalePct}%`, height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                        borderRadius: '2px',
                        transition: 'width 0.1s linear',
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{upscalePct}%</div>
                  </div>
                )}
              </div>
              {phase !== 'ready' && phase !== 'error' && (
                <div style={{
                  width: '18px', height: '18px', flexShrink: 0,
                  border: '2px solid rgba(59,130,246,0.2)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              )}
            </div>

            {/* Image Area */}
            <div style={{
              position: 'relative',
              minHeight: '320px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.03) 0%, transparent 70%)',
            }}>

              {/* Scanning line animation during cropping */}
              {phase === 'cropping' && analyzeData?.lowResImage && (
                <div style={{
                  position: 'absolute', top: '20px', bottom: '20px', left: '20px', right: '20px',
                  pointerEvents: 'none', overflow: 'hidden', zIndex: 10,
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
                    boxShadow: '0 0 15px rgba(59,130,246,0.5), 0 0 30px rgba(59,130,246,0.2)',
                    animation: 'scanLine 2s ease-in-out infinite',
                  }} />
                </div>
              )}

              {/* Glow pulse during removing */}
              {(phase === 'removing') && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(circle at center, rgba(16,185,129,0.08) 0%, transparent 60%)',
                  animation: 'glowPulse 1.5s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Low-res preview - ALWAYS blurred from step 2 onwards */}
              {analyzeData?.lowResImage && phase !== 'ready' && (
                <img
                  src={analyzeData.lowResImage}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '400px',
                    objectFit: 'contain',
                    ...cropStyle,
                    filter: `blur(${phase === 'cropping' ? '6px' : phase === 'removing' ? '10px brightness(0.3)' : phase === 'upscaling' ? '12px brightness(0.2)' : '0px'})`,
                    transition: `${cropStyle.transition || ''}, filter 1s ease`,
                    borderRadius: '4px',
                  }}
                />
              )}

              {/* Upscaling overlay text */}
              {phase === 'upscaling' && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  textAlign: 'center', zIndex: 20, pointerEvents: 'none',
                }}>
                  <div style={{
                    fontSize: '32px', fontWeight: '800',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'textPulse 1.2s ease-in-out infinite',
                    letterSpacing: '-0.5px',
                  }}>
                    {upscaleText}
                  </div>
                  <div style={{
                    fontSize: '13px', color: 'rgba(255,255,255,0.4)',
                    marginTop: '8px',
                    animation: 'fadeInOut 2s ease-in-out infinite',
                  }}>
                    AI Enhancement in Progress
                  </div>
                </div>
              )}

              {/* Removing BG overlay */}
              {phase === 'removing' && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  textAlign: 'center', zIndex: 20, pointerEvents: 'none',
                }}>
                  <div style={{
                    fontSize: '24px', fontWeight: '700', color: '#10b981',
                    animation: 'textPulse 1s ease-in-out infinite',
                  }}>
                    🎨 Cleaning
                  </div>
                </div>
              )}

              {/* Fetching spinner */}
              {phase === 'fetching' && !analyzeData && (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{
                    width: '48px', height: '48px', margin: '0 auto 20px',
                    border: '3px solid rgba(59,130,246,0.15)',
                    borderTopColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>Connecting to BhuNaksha server...</div>
                  <div style={{
                    marginTop: '12px', width: '120px', height: '2px',
                    background: 'rgba(59,130,246,0.1)', borderRadius: '1px',
                    margin: '12px auto 0', overflow: 'hidden',
                  }}>
                    <div style={{ width: '40%', height: '100%', background: '#3b82f6', borderRadius: '1px', animation: 'loadSlide 1.5s ease-in-out infinite' }} />
                  </div>
                </div>
              )}

              {/* Final high-res result */}
              {phase === 'ready' && highResBlob && (
                <div style={{ animation: 'revealMap 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <img
                    src={URL.createObjectURL(highResBlob)}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '500px',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    }}
                  />
                  {/* Sparkle particles */}
                  <div style={{ position: 'absolute', top: '10%', left: '15%', fontSize: '16px', animation: 'sparkle 2s ease-out infinite' }}>✨</div>
                  <div style={{ position: 'absolute', top: '20%', right: '20%', fontSize: '12px', animation: 'sparkle 2s ease-out infinite 0.5s' }}>✨</div>
                  <div style={{ position: 'absolute', bottom: '25%', left: '25%', fontSize: '14px', animation: 'sparkle 2s ease-out infinite 1s' }}>✨</div>
                </div>
              )}
            </div>

            {/* Download button */}
            {phase === 'ready' && (
              <div style={{ padding: '0 20px 20px', animation: 'fadeInUp 0.5s ease-out' }}>
                <button onClick={handleDownload} style={{
                  width: '100%', padding: '16px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', border: 'none', borderRadius: '10px',
                  fontSize: '17px', fontWeight: '700', cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                }}>
                  💾 Download {selectedRes?.label || ''} Map
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

      {/* All CSS Animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes scanLine {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes textPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @keyframes loadSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes revealMap {
          0% { opacity: 0; transform: scale(0.9); filter: blur(10px); }
          100% { opacity: 1; transform: scale(1); filter: blur(0px); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sparkle {
          0% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(180deg); }
          100% { opacity: 0; transform: scale(0) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
