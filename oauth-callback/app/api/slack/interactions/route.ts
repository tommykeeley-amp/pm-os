import { NextRequest, NextResponse } from 'next/server';
import { getPendingConfluenceRequest, removePendingConfluenceRequest, markThreadHasConfluenceDoc, getPendingJiraRequest, removePendingJiraRequest, markThreadHasJiraTicket, addPendingTask } from '../store';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Add GET handler for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Slack Interactions endpoint is running',
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  console.log('[Slack Interactions] Received POST request');

  try {
    const body = await request.text();
    console.log('[Slack Interactions] Body length:', body.length);

    const params = new URLSearchParams(body);
    const payloadStr = params.get('payload');

    if (!payloadStr) {
      console.error('[Slack Interactions] No payload in request');
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

      if (action.action_id === 'open_jira_modal') {
        return await handleOpenJiraModal(payload);
      }
    }

    // Handle modal submission
    if (payload.type === 'view_submission') {
      if (payload.view.callback_id === 'confluence_context_modal') {
        return await handleConfluenceModalSubmission(payload);
      }

      if (payload.view.callback_id === 'jira_ticket_modal') {
        return await handleJiraModalSubmission(payload);
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
        type: 'input',
        block_id: 'doc_title',
        label: {
          type: 'plain_text',
          text: 'Document Title',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'title_input',
          initial_value: requestData.title || 'Untitled',
          placeholder: {
            type: 'plain_text',
            text: 'Enter the title for your Confluence page...',
          },
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

  // Extract title and additional context from modal
  const values = payload.view.state.values;
  const docTitle = values.doc_title?.title_input?.value || requestData.title || 'Untitled';
  const additionalContext = values.additional_context?.context_input?.value || '';

  console.log('[Slack Interactions] Title:', docTitle);
  console.log('[Slack Interactions] Additional context provided:', !!additionalContext);

  // Combine thread context with additional context
  const fullContext = additionalContext
    ? `${requestData.threadContext}\n\n---\n\nAdditional Context:\n${additionalContext}`
    : requestData.threadContext;

  // Create the task to be picked up by the Electron app
  // Electron will handle the OpenAI processing to avoid timeout
  const taskData = {
    id: `${requestData.channel}_${requestData.messageTs}`,
    title: docTitle, // Use the title from the modal input
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

async function handleOpenJiraModal(payload: any) {
  const triggerId = payload.trigger_id;
  const requestId = payload.actions[0].value;

  console.log('[Slack Interactions] Opening Jira modal for request:', requestId);

  // Get the pending request data
  const requestData = getPendingJiraRequest(requestId);
  if (!requestData) {
    console.error('[Slack Interactions] Jira request not found:', requestId);
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
    callback_id: 'jira_ticket_modal',
    private_metadata: requestId,
    title: {
      type: 'plain_text',
      text: 'Create Jira Ticket',
    },
    submit: {
      type: 'plain_text',
      text: 'Create Jira',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'input',
        block_id: 'ticket_title',
        label: {
          type: 'plain_text',
          text: 'Summary',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'title_input',
          initial_value: requestData.title || '',
          placeholder: {
            type: 'plain_text',
            text: 'Enter ticket summary...',
          },
        },
      },
      {
        type: 'input',
        block_id: 'ticket_description',
        label: {
          type: 'plain_text',
          text: 'Description',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'description_input',
          multiline: true,
          initial_value: requestData.description || '',
          placeholder: {
            type: 'plain_text',
            text: 'Enter ticket description...',
          },
        },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'parent_ticket',
        label: {
          type: 'plain_text',
          text: 'Parent Ticket',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'parent_input',
          initial_value: requestData.parent || '',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., AMP-12345',
          },
        },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'priority',
        label: {
          type: 'plain_text',
          text: 'Priority',
        },
        element: {
          type: 'static_select',
          action_id: 'priority_select',
          initial_option: {
            text: {
              type: 'plain_text',
              text: requestData.priority || 'Medium',
            },
            value: requestData.priority || 'Medium',
          },
          options: [
            { text: { type: 'plain_text', text: 'Highest' }, value: 'Highest' },
            { text: { type: 'plain_text', text: 'High' }, value: 'High' },
            { text: { type: 'plain_text', text: 'Medium' }, value: 'Medium' },
            { text: { type: 'plain_text', text: 'Low' }, value: 'Low' },
            { text: { type: 'plain_text', text: 'Lowest' }, value: 'Lowest' },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'assignee_name',
        label: {
          type: 'plain_text',
          text: 'Assignee Name',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'assignee_name_input',
          initial_value: requestData.assigneeName || '',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Tommy Keeley',
          },
        },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'assignee_email',
        label: {
          type: 'plain_text',
          text: 'Assignee Email',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'assignee_email_input',
          initial_value: requestData.assigneeEmail || '',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., tommy.keeley@amplitude.com',
          },
        },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'pillar',
        label: {
          type: 'plain_text',
          text: 'Pillar',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'pillar_input',
          initial_value: requestData.pillar || 'Growth',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Growth, Product, Platform',
          },
        },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'pod',
        label: {
          type: 'plain_text',
          text: 'Pod',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'pod_input',
          initial_value: requestData.pod || 'Retention',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Retention, Acquisition, Core',
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
    console.error('[Slack Interactions] Failed to open Jira modal:', data.error);
    return NextResponse.json({ error: data.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleJiraModalSubmission(payload: any) {
  const requestId = payload.view.private_metadata;
  console.log('[Slack Interactions] Processing Jira modal submission for request:', requestId);

  // Get the pending request data
  const requestData = getPendingJiraRequest(requestId);
  if (!requestData) {
    console.error('[Slack Interactions] Jira request not found:', requestId);
    return NextResponse.json({
      response_action: 'errors',
      errors: {
        ticket_title: 'Request expired. Please try again.',
      },
    });
  }

  // Extract values from modal
  const values = payload.view.state.values;
  const title = values.ticket_title?.title_input?.value || requestData.title;
  const description = values.ticket_description?.description_input?.value || requestData.description;
  const parent = values.parent_ticket?.parent_input?.value || requestData.parent;
  const priority = values.priority?.priority_select?.selected_option?.value || requestData.priority;
  const assigneeName = values.assignee_name?.assignee_name_input?.value || requestData.assigneeName;
  const assigneeEmail = values.assignee_email?.assignee_email_input?.value || requestData.assigneeEmail;
  const pillar = values.pillar?.pillar_input?.value || requestData.pillar || 'Growth';
  const pod = values.pod?.pod_input?.value || requestData.pod || 'Retention';

  console.log('[Slack Interactions] Creating Jira ticket:', { title, parent, priority, assigneeName, pillar, pod });

  // Create the task to be picked up by the Electron app for Jira creation
  const taskData = {
    id: `${requestData.channel}_${requestData.messageTs}`,
    title,
    description,
    channel: requestData.channel,
    messageTs: requestData.messageTs,
    threadTs: requestData.threadTs,
    user: requestData.user,
    teamId: requestData.teamId,
    timestamp: Date.now(),
    processed: false,
    shouldCreateJira: true,
    shouldCreateConfluence: false,
    assigneeName,
    assigneeEmail,
    parent,
    priority,
    pillar,
    pod,
  };

  // Store as pending task for Electron to process
  addPendingTask(taskData);

  // Mark thread as having a Jira ticket
  const threadKey = `${requestData.channel}_${requestData.threadTs || requestData.messageTs}`;
  markThreadHasJiraTicket(threadKey);

  // Clean up pending request
  removePendingJiraRequest(requestId);

  console.log('[Slack Interactions] Jira ticket queued for creation');

  // Return success immediately - modal will close
  return NextResponse.json({ response_action: 'clear' });
}
