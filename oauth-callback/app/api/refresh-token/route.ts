import { NextRequest, NextResponse } from 'next/server';

/**
 * Refresh OAuth access tokens with server-side client credentials.
 * Currently supports Jira/Atlassian.
 */
export async function POST(request: NextRequest) {
  try {
    const { provider, refreshToken } = await request.json();

    if (!provider || !refreshToken) {
      return NextResponse.json({ error: 'Missing provider or refreshToken' }, { status: 400 });
    }

    if (provider !== 'jira') {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID;
    const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET;

    if (!ATLASSIAN_CLIENT_ID || !ATLASSIAN_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Missing Atlassian OAuth credentials' }, { status: 500 });
    }

    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ATLASSIAN_CLIENT_ID,
        client_secret: ATLASSIAN_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return NextResponse.json({ error: 'Token refresh failed', details: tokens }, { status: 400 });
    }

    if (tokens.access_token) {
      try {
        const resourceResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Accept': 'application/json',
          },
        });

        if (resourceResponse.ok) {
          tokens.accessible_resources = await resourceResponse.json();
        } else {
          tokens.accessible_resources = [];
        }
      } catch {
        tokens.accessible_resources = [];
      }
    }

    return NextResponse.json({ tokens });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to refresh token' }, { status: 500 });
  }
}
