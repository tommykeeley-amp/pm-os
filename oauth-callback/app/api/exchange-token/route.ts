import { NextRequest, NextResponse } from 'next/server';

// In-memory token storage (valid for 60 seconds)
const tokenStore = new Map<string, { tokens: any; expiresAt: number }>();

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of tokenStore.entries()) {
    if (data.expiresAt < now) {
      tokenStore.delete(sessionId);
    }
  }
}, 60000); // Clean every 60 seconds

export async function POST(request: NextRequest) {
  try {
    const { code, provider } = await request.json();

    if (!code || !provider) {
      return NextResponse.json({ error: 'Missing code or provider' }, { status: 400 });
    }

    const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'https://pm-os.vercel.app/oauth-callback';
    let tokenResponse;

    if (provider === 'google') {
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return NextResponse.json({ error: 'Missing Google OAuth credentials' }, { status: 500 });
      }

      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
    } else if (provider === 'slack') {
      const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
      const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;

      if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
        return NextResponse.json({ error: 'Missing Slack OAuth credentials' }, { status: 500 });
      }

      tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: SLACK_CLIENT_ID,
          client_secret: SLACK_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
        }),
      });
    } else {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || (provider === 'slack' && !tokens.ok)) {
      console.error('Token exchange failed:', tokens);
      return NextResponse.json({ error: 'Token exchange failed', details: tokens }, { status: 400 });
    }

    // Generate session ID and store tokens temporarily
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    tokenStore.set(sessionId, {
      tokens,
      expiresAt: Date.now() + 60000, // 60 seconds
    });

    return NextResponse.json({ sessionId });
  } catch (error: any) {
    console.error('Exchange token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const data = tokenStore.get(sessionId);

    if (!data) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    // Delete tokens after retrieval (one-time use)
    tokenStore.delete(sessionId);

    return NextResponse.json({ tokens: data.tokens });
  } catch (error: any) {
    console.error('Get token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
