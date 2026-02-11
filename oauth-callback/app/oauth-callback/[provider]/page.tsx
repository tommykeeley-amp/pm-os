'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

export default function MCPOAuthCallback() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const [callbackUrl, setCallbackUrl] = useState<string>('');

  useEffect(() => {
    const provider = params.provider as string;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      const errorDesc = searchParams.get('error_description') || errorParam;
      setError(`OAuth error: ${errorDesc}`);
      setStatus('error');
      return;
    }

    if (!code) {
      setError('No authorization code received');
      setStatus('error');
      return;
    }

    // Build custom protocol URL for MCP OAuth
    const params_obj = new URLSearchParams();
    params_obj.set('code', code);
    if (state) params_obj.set('state', state);

    const url = `pmos://oauth/callback/${provider}?${params_obj.toString()}`;
    setCallbackUrl(url);

    console.log(`[MCP OAuth] Redirecting to: ${url}`);

    // Try to redirect to custom protocol
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);

    setTimeout(() => {
      window.location.href = url;
    }, 100);

    setStatus('success');
  }, [params, searchParams]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#0f0f0f',
      color: '#fff',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        padding: '40px',
        background: '#1a1a1a',
        borderRadius: '12px',
        border: '1px solid #333',
        textAlign: 'center'
      }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Connecting MCP...</h1>
            <p style={{ color: '#888', fontSize: '14px' }}>Please wait while we redirect you back to PM-OS.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Authorization Successful!</h1>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px' }}>
              Redirecting to PM-OS...
            </p>
            <button
              onClick={() => window.location.href = callbackUrl}
              style={{
                padding: '12px 24px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '10px'
              }}
            >
              Open PM-OS
            </button>
            <p style={{ color: '#666', fontSize: '12px', wordBreak: 'break-all', marginTop: '20px' }}>
              If PM-OS doesn't open, copy this URL and paste it in your browser:<br/>
              <code style={{ background: '#000', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'inline-block', marginTop: '8px' }}>
                {callbackUrl}
              </code>
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>❌</div>
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Authorization Failed</h1>
            <p style={{ color: '#ff6b6b', fontSize: '14px', marginBottom: '20px' }}>
              {error}
            </p>
            <p style={{ color: '#666', fontSize: '12px' }}>
              Please close this window and try again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
