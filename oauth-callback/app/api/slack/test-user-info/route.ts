import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        error: 'Missing userId parameter. Usage: /api/slack/test-user-info?userId=U12345'
      }, { status: 400 });
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({
        error: 'SLACK_BOT_TOKEN not configured'
      }, { status: 500 });
    }

    const url = `https://slack.com/api/users.info?user=${userId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    const data = await response.json();

    return NextResponse.json({
      success: data.ok,
      user: data.user ? {
        id: data.user.id,
        name: data.user.name,
        real_name: data.user.real_name,
        email: data.user.profile?.email || 'NO EMAIL FOUND',
        has_email: !!data.user.profile?.email
      } : null,
      error: data.error || null,
      raw_response: data
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch user info',
      details: String(error)
    }, { status: 500 });
  }
}
