import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Authorization Endpoint for Google
 *
 * This endpoint initiates the OAuth flow by redirecting the user to Google's authorization page.
 * OAuth credentials (CLIENT_ID, CLIENT_SECRET) are stored server-side in Vercel environment variables.
 */
export async function GET(request: NextRequest) {
  console.log('[OAuth/Google] Authorization request received');

  try {
    // Get OAuth credentials from environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    // Validate credentials
    if (!clientId) {
      console.error('[OAuth/Google] Missing GOOGLE_CLIENT_ID environment variable');
      return NextResponse.json(
        { error: 'OAuth not configured. Missing GOOGLE_CLIENT_ID.' },
        { status: 500 }
      );
    }

    if (!redirectUri) {
      console.error('[OAuth/Google] Missing OAUTH_REDIRECT_URI environment variable');
      return NextResponse.json(
        { error: 'OAuth not configured. Missing OAUTH_REDIRECT_URI.' },
        { status: 500 }
      );
    }

    // Encode provider in state parameter so callback knows which provider
    const state = Buffer.from(JSON.stringify({ provider: 'google' })).toString('base64');

    // Build Google OAuth URL
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/contacts.readonly', // For searching personal contacts
      'https://www.googleapis.com/auth/directory.readonly', // For searching organization directory
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    console.log('[OAuth/Google] Redirecting to Google authorization page');
    console.log('[OAuth/Google] Client ID:', clientId.substring(0, 20) + '...');
    console.log('[OAuth/Google] Redirect URI:', redirectUri);

    // Redirect to Google
    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[OAuth/Google] Error generating authorization URL:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow', details: error.message },
      { status: 500 }
    );
  }
}
