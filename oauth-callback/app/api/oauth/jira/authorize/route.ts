import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Authorization Endpoint for Jira/Atlassian
 *
 * Initiates Atlassian 3LO OAuth and redirects the user to Atlassian consent.
 */
export async function GET(_request: NextRequest) {
  try {
    const clientId = process.env.ATLASSIAN_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    if (!clientId) {
      return NextResponse.json(
        { error: 'OAuth not configured. Missing ATLASSIAN_CLIENT_ID.' },
        { status: 500 }
      );
    }

    if (!redirectUri) {
      return NextResponse.json(
        { error: 'OAuth not configured. Missing OAUTH_REDIRECT_URI.' },
        { status: 500 }
      );
    }

    const state = Buffer.from(JSON.stringify({ provider: 'jira' })).toString('base64');

    const scopes = [
      'read:me',
      'read:jira-user',
      'read:jira-work',
      'write:jira-work',
      'offline_access',
    ].join(' ');

    const authUrl = new URL('https://auth.atlassian.com/authorize');
    authUrl.searchParams.set('audience', 'api.atlassian.com');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('prompt', 'consent');

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow', details: error.message },
      { status: 500 }
    );
  }
}
