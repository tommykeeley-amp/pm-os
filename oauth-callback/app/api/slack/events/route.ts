import { NextRequest, NextResponse } from 'next/server';
import { addPendingTask, pendingTasks, hasThreadJiraTicket, markThreadHasJiraTicket, hasThreadConfluenceDoc, markThreadHasConfluenceDoc, addPendingConfluenceRequest } from '../store';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

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

      // CRITICAL: Only allow humans to trigger PM-OS, never bots
      if (body.event.bot_id || body.event.subtype) {
        console.log('[Slack Events] Ignoring bot message or subtype event (bot_id:', body.event.bot_id, 'subtype:', body.event.subtype, ')');
        return NextResponse.json({ ok: true });
      }

      // Additional safety: Check if the user is the PM-OS bot itself
      const pmOsBotUserId = body.authorizations?.[0]?.user_id;
      if (body.event.user === pmOsBotUserId) {
        console.log('[Slack Events] Ignoring message from PM-OS bot itself (user:', body.event.user, ')');
        return NextResponse.json({ ok: true });
      }

      // Add eyes emoji immediately for user feedback
      await addReaction(body.event.channel, body.event.ts, 'eyes');
      await handleTaskCreation(body.event, body.team_id);
      return NextResponse.json({ ok: true });
    }

    // Handle direct message events
    if (body.type === 'event_callback' && body.event?.type === 'message' && body.event?.channel_type === 'im') {
      console.log('[Slack Events] Received DM:', body.event);

      // CRITICAL: Only allow humans to trigger PM-OS, never bots
      if (body.event.bot_id || body.event.subtype) {
        console.log('[Slack Events] Ignoring bot DM or subtype event');
        return NextResponse.json({ ok: true });
      }

      // Additional safety: Check if the user is the PM-OS bot itself
      const pmOsBotUserId = body.authorizations?.[0]?.user_id;
      if (body.event.user === pmOsBotUserId) {
        console.log('[Slack Events] Ignoring DM from PM-OS bot itself');
        return NextResponse.json({ ok: true });
      }

      // Add eyes emoji immediately for user feedback
      await addReaction(body.event.channel, body.event.ts, 'eyes');
      await handleTaskCreation(body.event, body.team_id);
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
  console.log('[Slack Events] === handleTaskCreation called ===');
  console.log('[Slack Events] Full event object:', JSON.stringify(event, null, 2));

  const text = event.text.toLowerCase();
  const channel = event.channel;
  const messageTs = event.ts;
  const threadTs = event.thread_ts;

  // Declare variables at the top of the function
  let taskTitle = 'Task from Slack';
  let taskDescription = '';
  let shouldCreateJira = false;
  let shouldCreateConfluence = false;
  let assigneeName: string | undefined = undefined;
  let assigneeEmail: string | undefined = undefined;

  // Check if user wants to create a Confluence page
  // More flexible patterns to catch various phrasings
  const confluencePatterns = [
    /\bconfluence\s+(doc|page|document)\b/i,  // "confluence doc/page/document"
    /\b(create|make)\b.*\bconfluence\b/i,     // "create ... confluence"
    /\bconfluence\b.*\b(create|make)\b/i,     // "confluence ... create"
    /\b(doc|page|document)\b.*\bconfluence\b/i, // "doc ... confluence"
  ];
  shouldCreateConfluence = confluencePatterns.some(pattern => pattern.test(text));
  console.log('[Slack Events] Confluence detection - text:', text);
  console.log('[Slack Events] Confluence detection - shouldCreateConfluence:', shouldCreateConfluence);

  // Check if user wants to create a Jira ticket (more flexible matching)
  // Only check for Jira if Confluence wasn't requested (Confluence takes precedence)
  if (!shouldCreateConfluence) {
    shouldCreateJira = /\b(create|make)\b.*\b(jira|ticket|bug)\b/i.test(text) || /\b(jira|ticket|bug)\b.*\b(ticket|issue)\b/i.test(text);
  }
  console.log('[Slack Events] Jira detection - shouldCreateJira:', shouldCreateJira);
  console.log('[Slack Events] Original text:', event.text);
  console.log('[Slack Events] Lowercase text:', text);

  // Check if this thread already has a Jira ticket
  const threadKey = `${channel}_${threadTs || messageTs}`;
  if (shouldCreateJira && hasThreadJiraTicket(threadKey)) {
    console.log('[Slack Events] Thread already has a Jira ticket, skipping creation:', threadKey);
    shouldCreateJira = false;
  }

  // Check if this thread already has a Confluence doc
  if (shouldCreateConfluence && hasThreadConfluenceDoc(threadKey)) {
    console.log('[Slack Events] Thread already has a Confluence doc, skipping creation:', threadKey);
    shouldCreateConfluence = false;
  }

  // Check for Slack user mentions in "assign" context
  // Slack mentions look like: "assign it to <@U12345>"
  console.log('[Slack Events] Checking for assignment mentions...');
  console.log('[Slack Events] Raw event text:', JSON.stringify(event.text));

  // First, let's see ALL mentions in the text (excluding @PM-OS)
  const allMentions = event.text.match(/<@[A-Z0-9]+>/g);
  console.log('[Slack Events] All mentions found:', allMentions);

  let assignMentionMatch = null;

  // Strategy 1: Look for "assign" keyword followed by a mention
  if (event.text.toLowerCase().includes('assign')) {
    // Find the position of "assign" in the text
    const assignIndex = event.text.toLowerCase().indexOf('assign');
    const textAfterAssign = event.text.substring(assignIndex);

    // Look for a mention after "assign"
    const mentionMatch = textAfterAssign.match(/<@([A-Z0-9]+)>/);
    if (mentionMatch) {
      assignMentionMatch = mentionMatch;
      console.log('[Slack Events] Found mention after "assign" keyword:', mentionMatch[1]);
    }
  }

  console.log('[Slack Events] Assign mention match result:', assignMentionMatch);

  if (assignMentionMatch) {
    const slackUserId = assignMentionMatch[1];
    console.log('[Slack Events] Found Slack user mention for assignment:', slackUserId);

    // Fetch user info from Slack
    try {
      const userInfo = await fetchSlackUserInfo(slackUserId);
      console.log('[Slack Events] User info fetch result:', JSON.stringify(userInfo));
      if (userInfo && userInfo.email) {
        assigneeName = userInfo.name;
        assigneeEmail = userInfo.email;
        console.log('[Slack Events] Resolved Slack user:', { name: assigneeName, email: assigneeEmail });
      } else {
        console.log('[Slack Events] Failed to get email from user info');
      }
    } catch (error) {
      console.error('[Slack Events] Error fetching Slack user info:', error);
    }
  } else {
    console.log('[Slack Events] No assignment mention found in text');
  }

  console.log('[Slack Events] Final assignee values:', { assigneeName, assigneeEmail });

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
        // Only use AI assignee if we haven't already resolved it from a Slack mention
        if (!assigneeName) {
          assigneeName = aiResult.assignee;
        }
        console.log('[Slack Events] AI-generated task:', { taskTitle, taskDescription, assigneeName });
      } catch (aiError) {
        // AI failed - fall back to using thread context directly
        console.error('[Slack Events] AI synthesis failed:', aiError);

        // Use first message as title (cleaned up - remove command phrases)
        taskTitle = threadData.messages[0]?.text
          ?.replace(/<@[A-Z0-9]+>/gi, '')
          .replace(/^(can you |could you |please )?(make|create|add)( me| you| us)?( a)?( jira)?( ticket| task)( for| called| to| about)?/gi, '')
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

      // Remove command phrases (including "jira ticket")
      taskTitle = taskTitle
        .replace(/^(can you |could you |please )?(make|create|add)( me| you| us)?( a)?( jira)?( ticket| task)( for| called| to| about)?/gi, '')
        .trim();

      if (!taskTitle || taskTitle.length === 0) {
        taskTitle = 'Task from Slack';
      }
    }
  } catch (error) {
    console.error('[Slack Events] Error processing task:', error);
    // Fallback to simple text extraction with command phrase removal
    taskTitle = event.text
      .replace(/<@[A-Z0-9]+>/gi, '')
      .replace(/^(can you |could you |please )?(make|create|add)( me| you| us)?( a)?( jira)?( ticket| task)( for| called| to| about)?/gi, '')
      .trim()
      .slice(0, 100) || 'Task from Slack';
    taskDescription = 'Error creating task from context';
  }

  // Jira ticket will be created by Electron using user's credentials
  if (shouldCreateJira) {
    console.log('[Slack Events] Flagged for Jira ticket creation in PM-OS');
  }

  // Handle Confluence doc creation with modal for additional context
  if (shouldCreateConfluence) {
    console.log('[Slack Events] Confluence doc requested - sending button for modal');

    // Generate unique request ID
    const requestId = randomUUID();

    // Extract clean title for Confluence doc
    let confluenceTitle = taskTitle;
    // Try to extract title after "called", "named", or quoted text
    const calledMatch = event.text.match(/\b(?:called|named)\s+["']?([^"'\n]+?)["']?$/i);
    const quotedMatch = event.text.match(/["']([^"'\n]+?)["']/);

    if (calledMatch && calledMatch[1]) {
      confluenceTitle = calledMatch[1].trim();
    } else if (quotedMatch && quotedMatch[1]) {
      confluenceTitle = quotedMatch[1].trim();
    } else {
      // Remove Confluence-specific phrasing
      confluenceTitle = event.text
        .replace(/<@[A-Z0-9]+>/gi, '')
        .replace(/^(can you |could you |please )?create( me)?( you)?( us)?( a)?( an)?\s+(confluence\s+)?(doc|page|document)(\s+for\s+me)?(\s+called)?(\s+named)?/gi, '')
        .trim();
    }

    // Fallback if title is empty
    if (!confluenceTitle || confluenceTitle.length === 0) {
      confluenceTitle = 'Confluence Doc from Slack';
    }

    console.log('[Slack Events] Extracted Confluence title:', confluenceTitle);

    // Get thread context for later use
    let threadContext = '';
    try {
      const contextTs = threadTs || messageTs;
      const threadData = await fetchThreadContext(channel, contextTs);
      threadContext = threadData?.context || taskDescription;
    } catch (error) {
      console.error('[Slack Events] Failed to fetch thread context:', error);
      threadContext = taskDescription;
    }

    // Store the pending Confluence request
    addPendingConfluenceRequest(requestId, {
      title: confluenceTitle,
      threadContext,
      channel,
      messageTs,
      threadTs: threadTs || messageTs,
      user: event.user,
      teamId,
    });

    // Send interactive message with button
    await sendConfluenceContextButton(channel, threadTs || messageTs, taskTitle, requestId);

    // Mark thread as having a Confluence doc (to prevent duplicates)
    markThreadHasConfluenceDoc(threadKey);

    // Keep eyes reaction until doc is actually created
    console.log('[Slack Events] Confluence button sent, waiting for user input');
    return; // Exit early - don't create a task
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
    shouldCreateConfluence: false, // Confluence is handled separately with modal
    assigneeName,
    assigneeEmail,
  };

  // Store in pending tasks
  addPendingTask(taskData);
  console.log('[Slack Events] Stored pending task:', taskId);
  console.log('[Slack Events] Task data:', JSON.stringify({
    id: taskId,
    title: taskTitle,
    shouldCreateJira,
    assigneeName,
    assigneeEmail
  }));

  // Mark thread as having a Jira ticket if we're creating one
  if (shouldCreateJira) {
    markThreadHasJiraTicket(threadKey);
  }
}

async function fetchSlackUserInfo(userId: string): Promise<{ name: string; email: string } | null> {
  try {
    const botToken = process.env.SLACK_BOT_TOKEN;
    console.log('[Slack Events] Bot token available:', !!botToken);
    if (!botToken) {
      console.error('[Slack Events] No bot token in environment');
      return null;
    }

    const url = `https://slack.com/api/users.info?user=${userId}`;
    console.log('[Slack Events] Fetching user info for userId:', userId);
    console.log('[Slack Events] Request URL:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    console.log('[Slack Events] Response status:', response.status);
    const data = await response.json();
    console.log('[Slack Events] Slack user info response:', JSON.stringify(data, null, 2));

    if (!data.ok) {
      console.error('[Slack Events] Slack API returned error:', data.error);
      return null;
    }

    if (!data.user) {
      console.error('[Slack Events] No user data in response');
      return null;
    }

    const userEmail = data.user.profile?.email;
    const userName = data.user.real_name || data.user.name;
    console.log('[Slack Events] Extracted user info:', { userName, userEmail });

    if (!userEmail) {
      console.error('[Slack Events] User has no email address in Slack profile');
      return null;
    }

    return {
      name: userName,
      email: userEmail,
    };
  } catch (error) {
    console.error('[Slack Events] Error fetching user info:', error);
    return null;
  }
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

    // Resolve user IDs to names
    const userCache = new Map<string, string>();
    for (const msg of data.messages) {
      if (msg.user && !userCache.has(msg.user) && msg.user !== 'USLACKBOT') {
        try {
          const userInfo = await fetchSlackUserInfo(msg.user);
          if (userInfo) {
            userCache.set(msg.user, userInfo.name);
          }
        } catch (error) {
          console.error('[Slack Events] Failed to fetch user info for', msg.user, error);
        }
      }
    }

    // Combine all messages into context with resolved names
    const context = data.messages
      .map((msg: any) => {
        const userName = userCache.get(msg.user) || msg.user || 'Unknown';
        return `${userName}: ${msg.text}`;
      })
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
        content: 'You are extracting the core work/issue from a Slack conversation to create a Jira ticket title and description.\n\nCRITICAL RULES FOR TITLE:\n1. NEVER include command phrases like "create ticket", "create jira ticket", "make a ticket", "create task"\n2. Extract ONLY the actual work/problem being described\n3. Use imperative mood (e.g., "Document MCP tools" not "Documenting MCP tools")\n4. Keep under 60 characters\n5. Be specific but concise\n\nExamples:\n- "create jira ticket for MCP tools list" → "Document MCP tools list"\n- "make a ticket to fix the login bug" → "Fix login bug"\n- "we need to update the API documentation" → "Update API documentation"\n\nFor description: Capture the context and details from the conversation without repeating the command.\n\nIf someone is assigned (e.g., "assign to Ben"), extract their name in the "assignee" field.\n\nAlways respond with valid JSON containing "title", "description", and optionally "assignee" fields.',
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

async function removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
  try {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      console.error('[Slack Events] No bot token found for reaction');
      return;
    }

    const response = await fetch('https://slack.com/api/reactions.remove', {
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
      console.error('[Slack Events] Failed to remove reaction:', data.error);
    }
  } catch (error) {
    console.error('[Slack Events] Error removing reaction:', error);
  }
}

async function sendConfluenceContextButton(channel: string, threadTs: string, title: string, requestId: string): Promise<void> {
  try {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      console.error('[Slack Events] No bot token found');
      return;
    }

    const message = {
      channel,
      thread_ts: threadTs,
      text: `📄 Ready to create Confluence doc: "${title}"`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📄 *Ready to create Confluence doc:*\n"${title}"`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Click the button below to add additional context (optional) or create the doc with just the thread conversation.',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📝 Add Context & Create',
                emoji: true,
              },
              style: 'primary',
              action_id: 'open_confluence_modal',
              value: requestId,
            },
          ],
        },
      ],
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[Slack Events] Failed to send button message:', data.error);
    } else {
      console.log('[Slack Events] Button message sent successfully');
    }
  } catch (error) {
    console.error('[Slack Events] Error sending button message:', error);
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
