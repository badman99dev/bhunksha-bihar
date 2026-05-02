'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Download,
  Radio,
  Scissors,
  Paintbrush,
  Zap,
  CheckCircle2,
  XCircle,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Map,
  Search,
  X,
} from 'lucide-react';

const LEVEL_LABELS = ['District', 'Sub Division', 'Circle', 'Mauza', 'Survey Type', 'Map Instance', 'Sheet No'];

const RESOLUTION_OPTIONS = [
  { value: 800, label: 'Low', sub: '800px', warn: false },
  { value: 2000, label: '2K', sub: '2000px', warn: false },
  { value: 4000, label: '4K', sub: '4000px', warn: false },
  { value: 8000, label: '8K', sub: '8000px', warn: true, msg: 'Slow download' },
  { value: 16000, label: '16K', sub: '16000px', warn: true, msg: 'Very slow! May fail' },
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
  { key: 'fetching', num: '1', label: 'Fetch Map', icon: Radio },
  { key: 'cropping', num: '2', label: 'Smart Crop', icon: Scissors },
  { key: 'removing', num: '3', label: 'Remove BG', icon: Paintbrush },
  { key: 'upscaling', num: '4', label: 'Upscale', icon: Zap },
];

function IconWrapper({ children, color, size = 16, spin = false, pulse = false }: { children: React.ReactNode; color?: string; size?: number; spin?: boolean; pulse?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '8px',
      animation: spin ? 'iconSpin 1s linear infinite' : pulse ? 'iconPulse 1.5s ease-in-out infinite' : 'none',
      verticalAlign: 'middle',
    }}>
      {children}
    </span>
  );
}

function SparkleParticle({ top, left, right, bottom, delay, size }: { top?: string; left?: string; right?: string; bottom?: string; delay?: string; size?: number }) {
  return (
    <div style={{
      position: 'absolute',
      top, left, right, bottom,
      width: `${size || 6}px`,
      height: `${size || 6}px`,
      animation: `cssSparkle 2s ease-out infinite ${delay || '0s'}`,
      pointerEvents: 'none',
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(59,130,246,0.6) 40%, transparent 70%)',
        boxShadow: '0 0 6px rgba(59,130,246,0.6), 0 0 12px rgba(139,92,246,0.3)',
      }} />
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  onChange,
  disabled,
  loading,
  placeholder,
  isOpen,
  onToggle,
  onClose,
}: {
  value: string;
  options: LevelOption[];
  onChange: (val: string) => void;
  disabled: boolean;
  loading: boolean;
  placeholder: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const selectedOpt = options.find(o => o.code === value);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || loading}
        style={{
          width: '100%', padding: '10px 14px',
          background: !disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${isOpen ? 'rgba(59,130,246,0.5)' : !disabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius: '8px', color: !disabled ? '#e0e0e0' : '#374151', fontSize: '14px', outline: 'none',
          cursor: !disabled ? 'pointer' : 'not-allowed',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: isOpen ? '0 0 0 2px rgba(59,130,246,0.15)' : 'none',
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {loading ? 'Loading...' : selectedOpt ? selectedOpt.label : (disabled ? '' : placeholder)}
        </span>
        {!disabled && !loading && (
          isOpen ? <ChevronUp size={14} style={{ color: '#6b7280', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
        )}
        {loading && <Loader2 size={14} style={{ color: '#3b82f6', animation: 'iconSpin 1s linear infinite', flexShrink: 0 }} />}
      </button>

      {isOpen && !disabled && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          marginTop: '4px',
          background: '#161622',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: '10px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.1)',
          overflow: 'hidden',
          animation: 'dropIn 0.15s ease-out',
        }}>
          <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <Search size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#e0e0e0', fontSize: '13px', padding: '4px 0',
                fontFamily: 'inherit',
              }}
            />
            {search && (
              <button onClick={() => { setSearch(''); inputRef.current?.focus(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={12} style={{ color: '#6b7280' }} />
              </button>
            )}
          </div>

          <div ref={listRef} className="custom-scroll" style={{
            maxHeight: '220px', overflowY: 'auto',
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(59,130,246,0.3) transparent',
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
                No results found
              </div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.code}
                  onClick={() => { onChange(o.code); onClose(); }}
                  style={{
                    display: 'block', width: '100%', padding: '9px 14px',
                    background: o.code === value ? 'rgba(59,130,246,0.12)' : 'transparent',
                    border: 'none', color: o.code === value ? '#60a5fa' : '#c0c0c0',
                    fontSize: '13px', textAlign: 'left', cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (o.code !== value) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; } }}
                  onMouseLeave={e => { if (o.code !== value) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#c0c0c0'; } }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>

          {options.length > 0 && (
            <div style={{
              padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.04)',
              fontSize: '11px', color: '#4b5563', display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{filtered.length} of {options.length}</span>
              {search && <span style={{ color: '#3b82f6' }}>Filtered</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

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
    setOpenDropdown(null);
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
          <p style={{ color: '#6b7280', fontSize: '15px' }}>Select location &rarr; Download high-quality village map</p>
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
                <SearchableSelect
                  value={selections[i]}
                  options={options[i]}
                  onChange={val => handleSelect(i, val)}
                  disabled={!en || lb}
                  loading={lb}
                  placeholder={en && ho ? `Select ${label}` : ''}
                  isOpen={openDropdown === i}
                  onToggle={() => setOpenDropdown(openDropdown === i ? null : i)}
                  onClose={() => setOpenDropdown(null)}
                />
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
            {selectedRes?.warn && <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '6px', color: '#fbbf24', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={12} /> {selectedRes.msg}</div>}
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
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            {allSelected ? (<><Download size={18} /> Generate {selectedRes?.label || ''} Map</>) : 'Select all levels to continue'}
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
                  const StepIcon = step.icon;
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
                        display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px', fontWeight: '600',
                        color: isDone ? '#10b981' : isActive ? '#60a5fa' : '#374151',
                        transition: 'color 0.3s',
                        letterSpacing: '0.5px',
                      }}>
                        <StepIcon size={10} style={{ opacity: isDone ? 1 : isActive ? 0.9 : 0.3 }} />
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
                  display: 'flex', alignItems: 'center',
                }}>
                  {phase === 'fetching' && (
                    <><IconWrapper color="#3b82f6" spin><Radio size={16} style={{ color: '#3b82f6' }} /></IconWrapper>
                    <span style={{ background: 'linear-gradient(90deg, #60a5fa, #93c5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fetching map from BhuNaksha...</span></>
                  )}
                  {phase === 'cropping' && (
                    <><IconWrapper color="#3b82f6"><Scissors size={16} style={{ color: '#818cf8' }} /></IconWrapper>
                    <span style={{ background: 'linear-gradient(90deg, #818cf8, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Smart crop</span>
                    <span style={{ color: '#6b7280', marginLeft: '6px', fontSize: '13px' }}>&mdash; {analyzeData?.blankPct}% blank removed</span></>
                  )}
                  {phase === 'removing' && (
                    <><IconWrapper color="#10b981" pulse><Paintbrush size={16} style={{ color: '#10b981' }} /></IconWrapper>
                    <span style={{ background: 'linear-gradient(90deg, #10b981, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Removing background...</span></>
                  )}
                  {phase === 'upscaling' && (
                    <><IconWrapper color="#8b5cf6" spin><Zap size={16} style={{ color: '#8b5cf6' }} /></IconWrapper>
                    <span style={{ background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Upscaling to {upscaleText}...</span></>
                  )}
                  {phase === 'ready' && (
                    <><IconWrapper color="#10b981"><CheckCircle2 size={16} style={{ color: '#10b981' }} /></IconWrapper>
                    <span style={{ background: 'linear-gradient(90deg, #10b981, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '700' }}>Map ready!</span></>
                  )}
                  {phase === 'error' && (
                    <><IconWrapper color="#f87171"><XCircle size={16} style={{ color: '#f87171' }} /></IconWrapper>
                    <span style={{ color: '#f87171' }}>{errorMsg}</span></>
                  )}
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
                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
                        borderRadius: '2px',
                        transition: 'width 0.1s linear',
                        boxShadow: '0 0 8px rgba(139,92,246,0.4)',
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{upscalePct}%</div>
                  </div>
                )}
              </div>
              {phase !== 'ready' && phase !== 'error' && (
                <Loader2 size={18} style={{ color: '#3b82f6', animation: 'iconSpin 0.8s linear infinite', flexShrink: 0 }} />
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

              {/* Low-res preview */}
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
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>
                    <Zap size={12} style={{ color: 'rgba(139,92,246,0.6)' }} />
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
                    fontSize: '20px', fontWeight: '700',
                    color: '#10b981',
                    animation: 'textPulse 1s ease-in-out infinite',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <Paintbrush size={22} style={{ animation: 'iconSpin 2s linear infinite' }} />
                    <span style={{ background: 'linear-gradient(90deg, #10b981, #6ee7b7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Cleaning</span>
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
                    animation: 'iconSpin 0.7s linear infinite',
                  }} />
                  <div style={{ color: '#6b7280', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Map size={14} style={{ color: '#4b5563' }} />
                    Connecting to BhuNaksha server...
                  </div>
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
                <div style={{ animation: 'revealMap 0.8s cubic-bezier(0.16, 1, 0.3, 1)', position: 'relative' }}>
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
                  {/* CSS Sparkle Particles */}
                  <SparkleParticle top="10%" left="15%" delay="0s" size={5} />
                  <SparkleParticle top="20%" right="20%" delay="0.5s" size={4} />
                  <SparkleParticle bottom="25%" left="25%" delay="1s" size={6} />
                  <SparkleParticle top="35%" left="60%" delay="1.5s" size={3} />
                  <SparkleParticle bottom="15%" right="30%" delay="0.8s" size={5} />
                  <SparkleParticle top="50%" left="10%" delay="1.2s" size={4} />
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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                }}>
                  <Save size={20} />
                  Download {selectedRes?.label || ''} Map
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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  <RefreshCw size={14} />
                  Retry
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
            &larr; Download another map
          </button>
        )}
      </div>

      {/* All CSS Animations */}
      <style>{`
        @keyframes iconSpin { to { transform: rotate(360deg); } }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes iconPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }
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
        @keyframes cssSparkle {
          0% { opacity: 0; transform: scale(0) rotate(0deg); }
          20% { opacity: 1; transform: scale(1.2) rotate(72deg); }
          50% { opacity: 0.8; transform: scale(0.8) rotate(180deg); }
          80% { opacity: 0.4; transform: scale(1.1) rotate(288deg); }
          100% { opacity: 0; transform: scale(0) rotate(360deg); }
        }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(59,130,246,0.3); border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(59,130,246,0.5); }
      `}</style>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
