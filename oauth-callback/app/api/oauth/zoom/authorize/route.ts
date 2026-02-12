import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Authorization Endpoint for Zoom
 *
 * This endpoint initiates the OAuth flow by redirecting the user to Zoom's authorization page.
 * OAuth credentials (CLIENT_ID, CLIENT_SECRET) are stored server-side in Vercel environment variables.
 */
export async function GET(request: NextRequest) {
  console.log('[OAuth/Zoom] Authorization request received');

  try {
    // Get OAuth credentials from environment variables
    const clientId = process.env.ZOOM_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    // Validate credentials
    if (!clientId) {
      console.error('[OAuth/Zoom] Missing ZOOM_CLIENT_ID environment variable');
      return NextResponse.json(
        { error: 'OAuth not configured. Missing ZOOM_CLIENT_ID.' },
        { status: 500 }
      );
    }

    if (!redirectUri) {
      console.error('[OAuth/Zoom] Missing OAUTH_REDIRECT_URI environment variable');
      return NextResponse.json(
        { error: 'OAuth not configured. Missing OAUTH_REDIRECT_URI.' },
        { status: 500 }
      );
    }

    // Encode provider in state parameter so callback knows which provider
    const state = Buffer.from(JSON.stringify({ provider: 'zoom' })).toString('base64');

    // Build Zoom OAuth URL
    // Zoom scopes: https://developers.zoom.us/docs/integrations/oauth-scopes/
    const scopes = [
      'meeting:write', // Create meetings
      'meeting:read',  // Read meeting details
      'user:read',     // Get user info
    ].join(' ');

    const authUrl = new URL('https://zoom.us/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    console.log('[OAuth/Zoom] Redirecting to Zoom authorization page');
    console.log('[OAuth/Zoom] Client ID:', clientId.substring(0, 20) + '...');
    console.log('[OAuth/Zoom] Redirect URI:', redirectUri);

    // Redirect to Zoom
    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[OAuth/Zoom] Error generating authorization URL:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow', details: error.message },
      { status: 500 }
    );
  }
}
