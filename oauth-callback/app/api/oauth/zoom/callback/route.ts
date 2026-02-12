import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Callback Endpoint for Zoom
 *
 * This endpoint handles the OAuth callback from Zoom and exchanges the authorization code for tokens.
 */
export async function GET(request: NextRequest) {
  console.log('[OAuth/Zoom] Callback received');

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || error;
      console.error('[OAuth/Zoom] OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `http://localhost:5173/oauth-error?provider=zoom&error=${encodeURIComponent(errorDescription)}`
      );
    }

    // Validate authorization code
    if (!code) {
      console.error('[OAuth/Zoom] No authorization code received');
      return NextResponse.redirect(
        `http://localhost:5173/oauth-error?provider=zoom&error=No+authorization+code+received`
      );
    }

    // Get OAuth credentials
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret) {
      console.error('[OAuth/Zoom] Missing OAuth credentials');
      return NextResponse.redirect(
        `http://localhost:5173/oauth-error?provider=zoom&error=OAuth+not+configured`
      );
    }

    // Exchange code for tokens
    console.log('[OAuth/Zoom] Exchanging code for tokens...');

    const tokenUrl = 'https://zoom.us/oauth/token';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri!,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[OAuth/Zoom] Token exchange failed:', errorData);
      return NextResponse.redirect(
        `http://localhost:5173/oauth-error?provider=zoom&error=Token+exchange+failed`
      );
    }

    const tokens = await tokenResponse.json();
    console.log('[OAuth/Zoom] Tokens received successfully');

    // Build callback URL for Electron app
    const callbackUrl = new URL('pmos://oauth/callback/zoom');
    callbackUrl.searchParams.set('access_token', tokens.access_token);
    callbackUrl.searchParams.set('refresh_token', tokens.refresh_token);
    callbackUrl.searchParams.set('expires_in', tokens.expires_in.toString());
    callbackUrl.searchParams.set('scope', tokens.scope);

    console.log('[OAuth/Zoom] Redirecting to PM-OS app...');

    // Return HTML that redirects to custom protocol
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Zoom OAuth Success</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #0f0f0f;
              color: #fff;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: #1a1a1a;
              border-radius: 12px;
              border: 1px solid #333;
            }
            .success-icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 10px;
            }
            p {
              color: #888;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Zoom Connected!</h1>
            <p>Redirecting to PM-OS...</p>
          </div>
          <script>
            window.location.href = ${JSON.stringify(callbackUrl.toString())};
          </script>
        </body>
      </html>
      `,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  } catch (error: any) {
    console.error('[OAuth/Zoom] Callback error:', error);
    return NextResponse.redirect(
      `http://localhost:5173/oauth-error?provider=zoom&error=${encodeURIComponent(error.message)}`
    );
  }
}
