'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function OAuthCallback() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

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
    const callbackUrl = `pmos://oauth-callback?provider=${provider}&code=${encodeURIComponent(code)}`;

    console.log('Redirecting to:', callbackUrl);

    // Try to redirect to custom protocol
    try {
      window.location.href = callbackUrl;
      setStatus('success');

      // Show success message
      setTimeout(() => {
        setStatus('success');
      }, 500);
    } catch (e) {
      setError('Failed to redirect to PM-OS. Please copy the code manually.');
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
            <p style={{ color: '#666', fontSize: '12px' }}>
              If the app doesn't open automatically, please return to PM-OS manually.
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
