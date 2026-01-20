import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { channel, threadTs, text, botToken } = await request.json();

    if (!channel || !threadTs || !text || !botToken) {
      return NextResponse.json({
        success: false,
        error: 'channel, threadTs, text, and botToken are required'
      }, { status: 400 });
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        text,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[Slack Reply] Failed to send message:', data.error);
      return NextResponse.json({
        success: false,
        error: data.error
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Reply sent successfully'
    });
  } catch (error) {
    console.error('[Slack Reply] Error sending reply:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to send reply'
    }, { status: 500 });
  }
}
