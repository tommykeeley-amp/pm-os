'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const [callbackUrl, setCallbackUrl] = useState<string>('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const mcpProvider = searchParams.get('mcp'); // MCP OAuth (amplitude, clockwise, granola)

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

    // Handle MCP OAuth (skip token exchange, redirect directly to custom protocol)
    if (mcpProvider) {
      const params = new URLSearchParams();
      params.set('code', code);
      if (state) params.set('state', state);

      const url = `pmos://oauth/callback/${mcpProvider}?${params.toString()}`;
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
      return;
    }

    // Determine provider from state (for Google/Slack OAuth)
    let provider = 'google';
    if (state) {
      try {
        const stateObj = JSON.parse(atob(state));
        provider = stateObj.provider || 'google';
      } catch (e) {
        // If state parsing fails, keep default
      }
    }

    // Exchange code for tokens on the server (Google/Slack OAuth)
    async function exchangeToken() {
      try {
        const response = await fetch('/api/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, provider }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(`Token exchange failed: ${data.error || 'Unknown error'}`);
          setStatus('error');
          return;
        }

        // Build custom protocol URL with session ID
        const url = `pmos://oauth-callback?provider=${provider}&sessionId=${data.sessionId}`;
        setCallbackUrl(url);

        console.log('Redirecting to:', url);

        // Try to redirect to custom protocol
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        setTimeout(() => {
          window.location.href = url;
        }, 100);

        setStatus('success');
      } catch (e: any) {
        console.error('Token exchange failed:', e);
        setError(`Failed to exchange token: ${e.message}`);
        setStatus('error');
      }
    }

    exchangeToken();
  }, [searchParams]);

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
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Connecting to PM-OS...</h1>
            <p style={{ color: '#888', fontSize: '14px' }}>Please wait while we redirect you back to the app.</p>
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
            <p style={{ color: '#666', fontSize: '12px' }}>
              Click the button above if PM-OS doesn't open automatically.
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

export default function OAuthCallback() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#0f0f0f',
        color: '#fff'
      }}>
        <div style={{ fontSize: '48px' }}>⏳</div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}
