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

    if (errorParam) {
      setError(`OAuth error: ${errorParam}`);
      setStatus('error');
      return;
    }

    if (!code) {
      setError('No authorization code received');
      setStatus('error');
      return;
    }

    // Determine provider from state or URL
    // For simplicity, we'll pass provider in the state parameter
    let provider = 'google'; // default
    if (state) {
      try {
        const stateObj = JSON.parse(atob(state));
        provider = stateObj.provider || 'google';
      } catch (e) {
        // If state parsing fails, keep default
      }
    }

    // Build custom protocol URL
    const url = `pmos://oauth-callback?provider=${provider}&code=${encodeURIComponent(code)}`;
    setCallbackUrl(url);

    console.log('Redirecting to:', url);

    // Try to redirect to custom protocol
    try {
      // First try iframe approach (more reliable on some browsers)
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);

      // Also try direct redirect as fallback
      setTimeout(() => {
        window.location.href = url;
      }, 100);

      setStatus('success');
    } catch (e) {
      console.error('Protocol redirect failed:', e);
      setError('Failed to redirect to PM-OS automatically.');
      setStatus('error');
    }
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
