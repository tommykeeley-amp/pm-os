import { NextRequest, NextResponse } from 'next/server';
import { addPendingTask, pendingTasks } from '../store';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      console.log('[Slack Events] Handling URL verification');
      return new NextResponse(body.challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // Handle app mention events
    if (body.type === 'event_callback' && body.event?.type === 'app_mention') {
      console.log('[Slack Events] Received app mention:', body.event);
      await handleTaskCreation(body.event, body.team_id);
      return NextResponse.json({ ok: true });
    }

    // Handle direct message events
    if (body.type === 'event_callback' && body.event?.type === 'message' && body.event?.channel_type === 'im') {
      console.log('[Slack Events] Received DM:', body.event);

      // Ignore bot messages and message updates
      if (!body.event.bot_id && !body.event.subtype) {
        await handleTaskCreation(body.event, body.team_id);
      }
      return NextResponse.json({ ok: true });
    }

    // Default response
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Events] Error processing event:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleTaskCreation(event: any, teamId: string) {
  const text = event.text.toLowerCase();
  const channel = event.channel;
  const messageTs = event.ts;
  const threadTs = event.thread_ts;

  // Always create a task when PM-OS is mentioned (no keyword checking)
  console.log('[Slack Events] PM-OS mentioned, creating task...');

  let taskTitle = 'Task from Slack';
  let taskDescription = '';

  // Check if this is in a thread (and not the first message of a thread)
  const isInThread = threadTs && threadTs !== messageTs;

  try {
    if (isInThread) {
      // This is a reply in a thread - fetch full thread context
      console.log('[Slack Events] Message is in thread, fetching context...');
      const threadData = await fetchThreadContext(channel, threadTs);

      if (threadData) {
        // Try to use AI to synthesize task from thread
        try {
          const aiResult = await synthesizeTaskFromContext(threadData.context);
          taskTitle = aiResult.title;
          taskDescription = aiResult.description;
          console.log('[Slack Events] AI-generated task:', { taskTitle, taskDescription });
        } catch (aiError) {
          // AI failed - fall back to using thread context directly
          console.warn('[Slack Events] AI synthesis failed, using thread context directly:', aiError);

          // Use first message as title (cleaned up)
          taskTitle = threadData.messages[0]?.text
            ?.replace(/<@[A-Z0-9]+>/gi, '')
            .replace(/^(can you |could you |please )?make( me)?( you)?( us)? a task (for |called |to )?/gi, '')
            .replace(/^(can you |could you |please )?create( me)?( you)?( us)? a task (for |called |to )?/gi, '')
            .replace(/^(can you |could you |please )?add( me)?( you)?( us)? a task (for |called |to )?/gi, '')
            .trim()
            .slice(0, 100) || 'Task from Slack thread';

          // Use full thread as description
          taskDescription = `Thread context:\n\n${threadData.context}`;
        }
      } else {
        // Couldn't fetch thread - use current message
        taskTitle = event.text.replace(/<@[A-Z0-9]+>/gi, '').trim() || 'Task from Slack thread';
        taskDescription = 'Unable to fetch thread context';
      }
    } else {
      // Not in a thread - just use the message text
      taskTitle = event.text
        .replace(/<@[A-Z0-9]+>/gi, '') // Remove mentions
        .trim();

      // Remove common phrasing patterns
      taskTitle = taskTitle
        .replace(/^(can you |could you |please )?make( me)?( you)?( us)? a task (for |called |to )?/gi, '')
        .replace(/^(can you |could you |please )?create( me)?( you)?( us)? a task (for |called |to )?/gi, '')
        .replace(/^(can you |could you |please )?add( me)?( you)?( us)? a task (for |called |to )?/gi, '')
        .trim();

      if (!taskTitle || taskTitle.length === 0) {
        taskTitle = 'Task from Slack';
      }
    }
  } catch (error) {
    console.error('[Slack Events] Error processing task:', error);
    // Fallback to simple text extraction
    taskTitle = event.text.replace(/<@[A-Z0-9]+>/gi, '').trim() || 'Task from Slack';
    taskDescription = 'Error creating task from context';
  }

  // Create task data
  const taskId = `${channel}_${messageTs}`;
  const taskData = {
    id: taskId,
    title: taskTitle,
    description: taskDescription,
    channel,
    messageTs,
    threadTs: threadTs || messageTs,
    user: event.user,
    teamId,
    timestamp: Date.now(),
    processed: false,
  };

  // Store in pending tasks
  addPendingTask(taskData);
  console.log('[Slack Events] Stored pending task:', taskId);
}

async function fetchThreadContext(channel: string, threadTs: string): Promise<{ context: string; messages: any[] } | null> {
  try {
    // Get bot token from environment (Vercel will need this)
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      console.error('[Slack Events] No bot token in environment');
      return null;
    }

    // Fetch thread replies using Slack API
    const response = await fetch(`https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}`, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    const data = await response.json();

    if (!data.ok || !data.messages) {
      console.error('[Slack Events] Failed to fetch thread:', data.error);
      return null;
    }

    // Combine all messages into context
    const context = data.messages
      .map((msg: any) => `${msg.user}: ${msg.text}`)
      .join('\n');

    return {
      context,
      messages: data.messages
    };
  } catch (error) {
    console.error('[Slack Events] Error fetching thread:', error);
    return null;
  }
}

async function synthesizeTaskFromContext(context: string): Promise<{ title: string; description: string }> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
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

  const result = JSON.parse(completion.choices[0].message.content || '{}');
  return {
    title: result.title || 'Task from Slack thread',
    description: result.description || context,
  };
}

// Export GET to allow checking the endpoint is alive
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    pendingTasks: pendingTasks.size,
    message: 'Slack Events API is running'
  });
}
