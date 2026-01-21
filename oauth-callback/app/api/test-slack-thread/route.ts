import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel');
  const threadTs = searchParams.get('thread_ts');

  if (!channel || !threadTs) {
    return NextResponse.json({
      error: 'Missing channel or thread_ts query parameters',
      usage: 'Call with ?channel=C123&thread_ts=1234567890.123456'
    }, { status: 400 });
  }

  const results: any = {
    step1_token_check: {},
    step2_fetch_thread: {},
    step3_ai_synthesis: {},
  };

  // Step 1: Check if bot token exists
  const botToken = process.env.SLACK_BOT_TOKEN;
  results.step1_token_check = {
    token_present: !!botToken,
    token_prefix: botToken ? botToken.substring(0, 15) + '...' : 'MISSING',
    openai_key_present: !!process.env.OPENAI_API_KEY,
  };

  if (!botToken) {
    return NextResponse.json({
      error: 'No SLACK_BOT_TOKEN in environment',
      results
    }, { status: 500 });
  }

  // Step 2: Fetch thread from Slack
  try {
    const url = `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}`;
    results.step2_fetch_thread.url = url;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    results.step2_fetch_thread.http_status = response.status;
    const data = await response.json();
    results.step2_fetch_thread.slack_response = data;

    if (!data.ok) {
      results.step2_fetch_thread.error = data.error;
      return NextResponse.json({
        error: 'Slack API error',
        results
      }, { status: 500 });
    }

    if (!data.messages || data.messages.length === 0) {
      return NextResponse.json({
        error: 'No messages found in thread',
        results
      }, { status: 500 });
    }

    results.step2_fetch_thread.message_count = data.messages.length;
    results.step2_fetch_thread.messages = data.messages.map((m: any) => ({
      user: m.user,
      text: m.text,
      ts: m.ts
    }));

    // Build context
    const context = data.messages
      .map((msg: any) => `${msg.user}: ${msg.text}`)
      .join('\n');

    results.step2_fetch_thread.context = context;

    // Step 3: Try AI synthesis
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates task titles and descriptions from Slack thread conversations. Create a concise task title (max 60 chars) and a brief description summarizing the key points and action items from the conversation. Always respond with valid JSON containing "title" and "description" fields.',
          },
          {
            role: 'user',
            content: `Based on this Slack thread conversation, create a task:\n\n${context}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const aiResult = JSON.parse(completion.choices[0].message.content || '{}');
      results.step3_ai_synthesis = {
        success: true,
        title: aiResult.title,
        description: aiResult.description,
        raw_response: completion.choices[0].message.content
      };

    } catch (aiError: any) {
      results.step3_ai_synthesis = {
        success: false,
        error: aiError.message,
        error_details: aiError
      };
    }

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error: any) {
    results.step2_fetch_thread.error = error.message;
    return NextResponse.json({
      error: 'Failed to fetch thread',
      results
    }, { status: 500 });
  }
}
