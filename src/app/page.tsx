'use client';

import { useState } from 'react';

export default function Home() {
  const [gisCode, setGisCode] = useState('');
  const [state, setState] = useState('10');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleDownload = async () => {
    if (!gisCode.trim()) {
      setError('Please enter a GIS Code');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Downloading low-resolution scan...');

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gisCode: gisCode.trim(),
          state,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Download failed');
      }

      setStatus('Processing complete! Downloading high-quality map...');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bhunaksha_${gisCode.trim()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setStatus('Download complete! ✅');
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: '8px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          🗺️ BhuNaksha Bihar
        </h1>
        <p style={{
          textAlign: 'center',
          color: '#666',
          marginBottom: '32px',
        }}>
          High Quality Map Downloader
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '600',
            color: '#333',
          }}>
            GIS Code
          </label>
          <input
            type="text"
            value={gisCode}
            onChange={(e) => setGisCode(e.target.value)}
            placeholder="e.g. RS07010100582870700"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '16px',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '600',
            color: '#333',
          }}>
            State Code
          </label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Default: 10"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={handleDownload}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: loading ? '#a0aec0' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
          }}
        >
          {loading ? '⏳ Processing...' : '📥 Download High-Quality Map'}
        </button>

        {status && (
          <div style={{
            marginTop: '20px',
            padding: '12px 16px',
            background: '#f0f4ff',
            borderRadius: '8px',
            color: '#4c51bf',
            textAlign: 'center',
          }}>
            {status}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: '20px',
            padding: '12px 16px',
            background: '#fff5f5',
            borderRadius: '8px',
            color: '#e53e3e',
            textAlign: 'center',
          }}>
            ❌ {error}
          </div>
        )}

        <div style={{
          marginTop: '32px',
          padding: '16px',
          background: '#f7fafc',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#4a5568',
        }}>
          <strong>How it works:</strong>
          <ol style={{ margin: '8px 0 0 20px', lineHeight: '1.8' }}>
            <li>Downloads a low-resolution scan</li>
            <li>Analyzes pixels to find map boundaries</li>
            <li>Calculates optimal crop area</li>
            <li>Downloads high-resolution cropped map</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
