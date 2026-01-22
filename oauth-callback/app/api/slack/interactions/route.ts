import { NextRequest, NextResponse } from 'next/server';
import { getPendingConfluenceRequest, removePendingConfluenceRequest, markThreadHasConfluenceDoc } from '../store';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const payloadStr = params.get('payload');

    if (!payloadStr) {
      return NextResponse.json({ error: 'No payload' }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);
    console.log('[Slack Interactions] Received interaction:', payload.type);

    // Handle button click - open modal
    if (payload.type === 'block_actions') {
      const action = payload.actions[0];

      if (action.action_id === 'open_confluence_modal') {
        return await handleOpenConfluenceModal(payload);
      }
    }

    // Handle modal submission
    if (payload.type === 'view_submission') {
      if (payload.view.callback_id === 'confluence_context_modal') {
        return await handleConfluenceModalSubmission(payload);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Interactions] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleOpenConfluenceModal(payload: any) {
  const triggerId = payload.trigger_id;
  const requestId = payload.actions[0].value; // We'll pass the request ID in the button value

  console.log('[Slack Interactions] Opening modal for request:', requestId);

  // Get the pending request data
  const requestData = getPendingConfluenceRequest(requestId);
  if (!requestData) {
    console.error('[Slack Interactions] Request not found:', requestId);
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  // Open modal using Slack API
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    console.error('[Slack Interactions] No bot token');
    return NextResponse.json({ error: 'No bot token' }, { status: 500 });
  }

  const modal = {
    type: 'modal',
    callback_id: 'confluence_context_modal',
    private_metadata: requestId, // Store request ID for later
    title: {
      type: 'plain_text',
      text: 'Add Context',
    },
    submit: {
      type: 'plain_text',
      text: 'Create Doc',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Creating Confluence Doc:*\n"${requestData.title}"`,
        },
      },
      {
        type: 'input',
        block_id: 'additional_context',
        label: {
          type: 'plain_text',
          text: 'Additional Context',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'context_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Add any additional context, requirements, or details for the document...',
          },
        },
        optional: true,
      },
    ],
  };

  const response = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: modal,
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error('[Slack Interactions] Failed to open modal:', data.error);
    return NextResponse.json({ error: data.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleConfluenceModalSubmission(payload: any) {
  const requestId = payload.view.private_metadata;
  console.log('[Slack Interactions] Processing modal submission for request:', requestId);

  // Get the pending request data
  const requestData = getPendingConfluenceRequest(requestId);
  if (!requestData) {
    console.error('[Slack Interactions] Request not found:', requestId);
    return NextResponse.json({
      response_action: 'errors',
      errors: {
        additional_context: 'Request expired. Please try again.',
      },
    });
  }

  // Extract additional context from modal
  const values = payload.view.state.values;
  const additionalContext = values.additional_context?.context_input?.value || '';

  console.log('[Slack Interactions] Additional context provided:', !!additionalContext);

  // Combine thread context with additional context
  const fullContext = additionalContext
    ? `${requestData.threadContext}\n\n---\n\nAdditional Context:\n${additionalContext}`
    : requestData.threadContext;

  // Create the task to be picked up by the Electron app
  // Electron will handle the OpenAI processing to avoid timeout
  const taskData = {
    id: `${requestData.channel}_${requestData.messageTs}`,
    title: requestData.title,
    description: fullContext, // Pass raw context, let Electron process with OpenAI
    channel: requestData.channel,
    messageTs: requestData.messageTs,
    threadTs: requestData.threadTs,
    user: requestData.user,
    teamId: requestData.teamId,
    timestamp: Date.now(),
    processed: false,
    shouldCreateJira: false,
    shouldCreateConfluence: true,
    assigneeName: undefined,
    assigneeEmail: undefined,
  };

  // Store as pending task for Electron to process
  const { addPendingTask } = await import('../store');
  addPendingTask(taskData);

  // Mark thread as having a Confluence doc
  const threadKey = `${requestData.channel}_${requestData.threadTs || requestData.messageTs}`;
  markThreadHasConfluenceDoc(threadKey);

  // Clean up pending request
  removePendingConfluenceRequest(requestId);

  console.log('[Slack Interactions] Confluence doc queued for creation');

  // Return success immediately - modal will close
  // Don't wait for OpenAI processing to avoid timeout
  return NextResponse.json({ response_action: 'clear' });
}
