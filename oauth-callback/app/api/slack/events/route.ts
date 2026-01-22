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
      // Add eyes emoji immediately for user feedback
      await addReaction(body.event.channel, body.event.ts, 'eyes');
      await handleTaskCreation(body.event, body.team_id);
      return NextResponse.json({ ok: true });
    }

    // Handle direct message events
    if (body.type === 'event_callback' && body.event?.type === 'message' && body.event?.channel_type === 'im') {
      console.log('[Slack Events] Received DM:', body.event);

      // Ignore bot messages and message updates
      if (!body.event.bot_id && !body.event.subtype) {
        // Add eyes emoji immediately for user feedback
        await addReaction(body.event.channel, body.event.ts, 'eyes');
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

  // Declare variables at the top of the function
  let taskTitle = 'Task from Slack';
  let taskDescription = '';
  let shouldCreateJira = false;
  let assigneeName: string | undefined = undefined;

  // Check if user wants to create a Jira ticket (more flexible matching)
  shouldCreateJira = /\b(create|make)\b.*\bjira\b/i.test(text) || /\bjira\b.*\b(ticket|issue)\b/i.test(text);
  console.log('[Slack Events] Jira detection - shouldCreateJira:', shouldCreateJira);
  console.log('[Slack Events] Original text:', event.text);
  console.log('[Slack Events] Lowercase text:', text);

  // Always create a task when PM-OS is mentioned (no keyword checking)
  console.log('[Slack Events] PM-OS mentioned, creating task...');
  console.log('[Slack Events] Event details:', {
    channel,
    messageTs,
    threadTs,
    isInThread: !!threadTs,
    text: event.text,
    shouldCreateJira
  });

  // Check if this is in a thread - if thread_ts exists, we're in a thread context
  // Note: For the original message that starts a thread, thread_ts will equal ts
  // But we still want to fetch thread context if there are replies
  const isInThread = !!threadTs;

  try {
    // Always try to fetch conversation history to get context
    // Use thread_ts if available, otherwise use message ts
    const contextTs = threadTs || messageTs;
    console.log('[Slack Events] Fetching conversation context with ts:', contextTs);
    const threadData = await fetchThreadContext(channel, contextTs);

    if (threadData && threadData.messages.length > 1) {
      // We have thread context with multiple messages - use AI to synthesize
      console.log('[Slack Events] Found thread with', threadData.messages.length, 'messages');
      try {
        const aiResult = await synthesizeTaskFromContext(threadData.context);
        taskTitle = aiResult.title;
        taskDescription = aiResult.description;
        assigneeName = aiResult.assignee;
        console.log('[Slack Events] AI-generated task:', { taskTitle, taskDescription, assigneeName });
      } catch (aiError) {
        // AI failed - fall back to using thread context directly
        console.error('[Slack Events] AI synthesis failed:', aiError);

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
      // Single message or couldn't fetch context - just use the message text
      console.log('[Slack Events] No thread context found, using message text directly');
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

  // Jira ticket will be created by Electron using user's credentials
  if (shouldCreateJira) {
    console.log('[Slack Events] Flagged for Jira ticket creation in PM-OS');
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
    shouldCreateJira,
    assigneeName,
  };

  // Store in pending tasks
  addPendingTask(taskData);
  console.log('[Slack Events] Stored pending task:', taskId);
}

async function fetchThreadContext(channel: string, threadTs: string): Promise<{ context: string; messages: any[] } | null> {
  try {
    // Get bot token from environment (Vercel will need this)
    const botToken = process.env.SLACK_BOT_TOKEN;
    console.log('[Slack Events] Bot token present:', !!botToken);
    if (!botToken) {
      console.error('[Slack Events] No bot token in environment');
      return null;
    }

    // Fetch thread replies using Slack API
    const url = `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}`;
    console.log('[Slack Events] Fetching thread from:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    console.log('[Slack Events] Slack API response status:', response.status);
    const data = await response.json();
    console.log('[Slack Events] Slack API response:', JSON.stringify(data, null, 2));

    if (!data.ok) {
      console.error('[Slack Events] Slack API error:', data.error);
      console.error('[Slack Events] Full response:', JSON.stringify(data, null, 2));
      return null;
    }

    if (!data.messages || data.messages.length === 0) {
      console.error('[Slack Events] No messages in thread response');
      return null;
    }

    console.log('[Slack Events] Found', data.messages.length, 'messages in thread');

    // Combine all messages into context
    const context = data.messages
      .map((msg: any) => `${msg.user}: ${msg.text}`)
      .join('\n');

    console.log('[Slack Events] Thread context:', context);

    return {
      context,
      messages: data.messages
    };
  } catch (error) {
    console.error('[Slack Events] Error fetching thread:', error);
    return null;
  }
}

async function synthesizeTaskFromContext(context: string): Promise<{ title: string; description: string; assignee?: string }> {
  console.log('[Slack Events] Synthesizing task from context:', context);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates task titles and descriptions from Slack conversations. Summarize the conversation accurately and literally - do not invent problems or action items that were not discussed. Create a concise title (max 60 chars) that describes what was actually talked about, and a brief description (2-4 sentences) that captures the key points from the conversation. If the conversation mentions assigning the task to someone (e.g., "assign to Ben", "give this to Sarah"), extract their name in the "assignee" field. Always respond with valid JSON containing "title", "description", and optionally "assignee" fields.',
      },
      {
        role: 'user',
        content: `Based on this Slack conversation, create a task that accurately summarizes what was discussed:\n\n${context}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(completion.choices[0].message.content || '{}');
  console.log('[Slack Events] AI-synthesized result:', result);

  return {
    title: result.title || 'Task from Slack thread',
    description: result.description || context,
    assignee: result.assignee || undefined,
  };
}

async function addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
  try {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      console.error('[Slack Events] No bot token found for reaction');
      return;
    }

    const response = await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emoji,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[Slack Events] Failed to add reaction:', data.error);
    }
  } catch (error) {
    console.error('[Slack Events] Error adding reaction:', error);
  }
}

// Export GET to allow checking the endpoint is alive
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    pendingTasks: pendingTasks.size,
    message: 'Slack Events API is running'
  });
}
