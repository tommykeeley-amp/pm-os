import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Authorization Endpoint for Slack
 *
 * This endpoint initiates the OAuth flow by redirecting the user to Slack's authorization page.
 * OAuth credentials (CLIENT_ID, CLIENT_SECRET) are stored server-side in Vercel environment variables.
 *
 * Flow:
 * 1. User clicks "Connect" in PM-OS app
 * 2. PM-OS opens this endpoint in browser
 * 3. This endpoint redirects to Slack with proper OAuth parameters
 * 4. User authorizes on Slack
 * 5. Slack redirects back to /oauth-callback
 */
export async function GET(request: NextRequest) {
  console.log('[OAuth/Slack] Authorization request received');

  try {
    // Get OAuth credentials from environment variables
    const clientId = process.env.SLACK_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    // Validate credentials
    if (!clientId) {
      console.error('[OAuth/Slack] Missing SLACK_CLIENT_ID environment variable');
      return NextResponse.json(
        { error: 'OAuth not configured. Missing SLACK_CLIENT_ID.' },
        { status: 500 }
      );
    }

    if (!redirectUri) {
      console.error('[OAuth/Slack] Missing OAUTH_REDIRECT_URI environment variable');
      return NextResponse.json(
        { error: 'OAuth not configured. Missing OAUTH_REDIRECT_URI.' },
        { status: 500 }
      );
    }

    // Encode provider in state parameter so callback knows which provider
    const state = Buffer.from(JSON.stringify({ provider: 'slack' })).toString('base64');

    // Build Slack OAuth URL
    const scopes = [
      'app_mentions:read',
      'chat:write',
    ].join(',');

    const userScopes = [
      'channels:read',
      'channels:history',
      'groups:read',
      'groups:history',
      'mpim:history',
      'im:read',
      'im:history',
      'users:read',
      'stars:read',
      'search:read',
    ].join(',');

    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('user_scope', userScopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    console.log('[OAuth/Slack] Redirecting to Slack authorization page');
    console.log('[OAuth/Slack] Client ID:', clientId.substring(0, 20) + '...');
    console.log('[OAuth/Slack] Redirect URI:', redirectUri);

    // Redirect to Slack
    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[OAuth/Slack] Error generating authorization URL:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow', details: error.message },
      { status: 500 }
    );
  }
}
