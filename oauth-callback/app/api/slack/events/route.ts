import { NextRequest, NextResponse } from 'next/server';
import { addPendingTask, pendingTasks } from '../store';

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

  // Check if the message contains task creation keywords
  if (text.includes('make a task') || text.includes('create a task') || text.includes('add a task')) {
    // Extract task title from the message
    let taskTitle = event.text
      .replace(/<@[A-Z0-9]+>/gi, '') // Remove mentions
      .trim();

    // Remove common phrasing patterns
    taskTitle = taskTitle
      .replace(/^(can you |could you |please )?make a task (for |called |to )?/gi, '')
      .replace(/^(can you |could you |please )?create a task (for |called |to )?/gi, '')
      .replace(/^(can you |could you |please )?add a task (for |called |to )?/gi, '')
      .trim();

    // If there's a colon, use everything after it as the task title
    if (taskTitle.includes(':')) {
      taskTitle = taskTitle.split(':').slice(1).join(':').trim();
    }

    // If task title is empty, use a default
    if (!taskTitle || taskTitle.length === 0) {
      taskTitle = 'Task from Slack';
    }

    // Create task data
    const taskId = `${channel}_${messageTs}`;
    const taskData = {
      id: taskId,
      title: taskTitle,
      channel,
      messageTs,
      threadTs: event.thread_ts || event.ts,
      user: event.user,
      teamId,
      timestamp: Date.now(),
      processed: false,
    };

    // Store in pending tasks
    addPendingTask(taskData);
    console.log('[Slack Events] Stored pending task:', taskId);
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
