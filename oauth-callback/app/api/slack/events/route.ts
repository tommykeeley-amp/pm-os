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

  // Check if user wants to create a Jira ticket
  const shouldCreateJira = text.includes('create jira') || text.includes('make jira') || text.includes('jira ticket');

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

  let taskTitle = 'Task from Slack';
  let taskDescription = '';
  let jiraTicket: { key: string; url: string } | null = null;

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
        console.log('[Slack Events] AI-generated task:', { taskTitle, taskDescription });
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

  // Create Jira ticket if requested
  if (shouldCreateJira) {
    try {
      console.log('[Slack Events] Creating Jira ticket...');
      jiraTicket = await createJiraTicket(taskTitle, taskDescription);
      console.log('[Slack Events] Jira ticket created:', jiraTicket);

      // Update task to be about validating the Jira ticket
      taskTitle = `Validate Jira ticket: ${jiraTicket.key}`;
      taskDescription = `Review and validate the Jira ticket that was created:\n\n${taskDescription}\n\nJira ticket: ${jiraTicket.url}`;
    } catch (jiraError) {
      console.error('[Slack Events] Failed to create Jira ticket:', jiraError);
      taskDescription = `Failed to create Jira ticket: ${(jiraError as any).message}\n\nOriginal context:\n${taskDescription}`;
    }
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
    jiraTicket: jiraTicket || undefined,
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

async function createJiraTicket(title: string, description: string): Promise<{ key: string; url: string }> {
  const jiraDomain = process.env.JIRA_DOMAIN;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraApiToken = process.env.JIRA_API_TOKEN;
  const jiraProject = process.env.JIRA_DEFAULT_PROJECT || 'AMP';
  const jiraIssueType = process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task';

  if (!jiraDomain || !jiraEmail || !jiraApiToken) {
    throw new Error('Jira credentials not configured');
  }

  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

  const response = await fetch(`https://${jiraDomain}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: {
          key: jiraProject,
        },
        summary: title,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description || 'Created from Slack via PM-OS',
                },
              ],
            },
          ],
        },
        issuetype: {
          name: jiraIssueType,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Jira API error: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return {
    key: data.key,
    url: `https://${jiraDomain}/browse/${data.key}`,
  };
}

async function synthesizeTaskFromContext(context: string): Promise<{ title: string; description: string }> {
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

  const result = JSON.parse(completion.choices[0].message.content || '{}');
  return {
    title: result.title || 'Task from Slack thread',
    description: result.description || context,
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
