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
    console.log('[Slack Interactions] Payload callback_id:', payload.view?.callback_id || 'N/A');

    // Handle button click - open modal
    if (payload.type === 'block_actions') {
      const action = payload.actions[0];
      console.log('[Slack Interactions] Button action:', action.action_id);

      if (action.action_id === 'open_confluence_modal') {
        return await handleOpenConfluenceModal(payload);
      }

      if (action.action_id === 'open_jira_modal') {
        return await handleOpenJiraModal(payload);
      }

      // Handle Smart Inbox "Create Task" button
      if (action.action_id && action.action_id.startsWith('create_task_')) {
        return await handleCreateTaskFromDigest(payload);
      }
    }

    // Handle modal submission
    if (payload.type === 'view_submission') {
      console.log('[Slack Interactions] View submission callback_id:', payload.view.callback_id);

      if (payload.view.callback_id === 'confluence_context_modal') {
        return await handleConfluenceModalSubmission(payload);
      }

      if (payload.view.callback_id === 'jira_ticket_modal') {
        console.log('[Slack Interactions] Routing to Jira modal submission handler');
        return await handleJiraModalSubmission(payload);
      }

      console.log('[Slack Interactions] Unknown callback_id:', payload.view.callback_id);
    }

    console.log('[Slack Interactions] No matching handler found');
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
        element: requestData.pillarOptions && requestData.pillarOptions.length > 0 ? {
          type: 'static_select',
          action_id: 'pillar_select',
          // Use user's default pillar from settings (passed via requestData) - no hardcoded fallback
          initial_option: requestData.pillar ? {
            text: { type: 'plain_text', text: requestData.pillar },
            value: requestData.pillar,
          } : undefined,
          options: requestData.pillarOptions.map((opt: any) => ({
            text: { type: 'plain_text', text: opt.value },
            value: opt.value,
          })),
        } : {
          type: 'plain_text_input',
          action_id: 'pillar_input',
          // Use user's default pillar from settings (passed via requestData) - no hardcoded fallback
          initial_value: requestData.pillar || '',
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
        element: requestData.podOptions && requestData.podOptions.length > 0 ? {
          type: 'static_select',
          action_id: 'pod_select',
          // Use user's default pod from settings (passed via requestData) - no hardcoded fallback
          initial_option: requestData.pod ? {
            text: { type: 'plain_text', text: requestData.pod },
            value: requestData.pod,
          } : undefined,
          options: requestData.podOptions.map((opt: any) => ({
            text: { type: 'plain_text', text: opt.value },
            value: opt.value,
          })),
        } : {
          type: 'plain_text_input',
          action_id: 'pod_input',
          // Use user's default pod from settings (passed via requestData) - no hardcoded fallback
          initial_value: requestData.pod || '',
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
  try {
    const requestId = payload.view.private_metadata;
    console.log('[Slack Interactions] ===== JIRA MODAL SUBMISSION START =====');
    console.log('[Slack Interactions] Processing Jira modal submission for request:', requestId);

    // Get the pending request data
    const requestData = getPendingJiraRequest(requestId);
    console.log('[Slack Interactions] Request data found:', !!requestData);

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

  // Pillar and Pod can be either select (dropdown) or text input depending on whether options were available
  // Use user's settings (passed via requestData) - no hardcoded fallbacks
  const pillar = values.pillar?.pillar_select?.selected_option?.value ||
                 values.pillar?.pillar_input?.value ||
                 requestData.pillar ||
                 '';
  const pod = values.pod?.pod_select?.selected_option?.value ||
              values.pod?.pod_input?.value ||
              requestData.pod ||
              '';

  console.log('[Slack Interactions] Creating Jira ticket:', { title, parent, priority, assigneeName, pillar, pod });

  // IMPORTANT: Use the original message sender's email (not the modal submitter)
  // so that the sender's PM-OS instance picks up their own tasks
  // This ensures tasks are processed by the person who sent the @PM-OS message
  const reporterEmail = requestData.reporterEmail;
  const reporterName = requestData.reporterName;
  const originalUser = requestData.user;

  console.log('[Slack Interactions] Task will be queued for original sender:', reporterEmail);

  // Create the task to be picked up by the Electron app for Jira creation
  // Use a unique ID with _jira_confirmed suffix to avoid conflicts with initial request
  const taskData = {
    id: `${requestData.channel}_${requestData.messageTs}_jira_confirmed`,
    title,
    description,
    channel: requestData.channel,
    messageTs: requestData.messageTs,
    threadTs: requestData.threadTs,
    user: originalUser,
    teamId: requestData.teamId,
    timestamp: Date.now(),
    processed: false,
    shouldCreateJira: true,
    shouldCreateConfluence: false,
    assigneeName,
    assigneeEmail,
    reporterName: reporterName,
    reporterEmail: reporterEmail,
    parent,
    priority,
    pillar,
    pod,
  };

  console.log('[Slack Interactions] Adding confirmed Jira task to queue:', taskData.id);

  // Store as pending task for Electron to process (same as Confluence)
  addPendingTask(taskData);
  console.log('[Slack Interactions] Task added to pending queue');

  // Mark thread as having a Jira ticket
  const threadKey = `${requestData.channel}_${requestData.threadTs || requestData.messageTs}`;
  markThreadHasJiraTicket(threadKey);
  console.log('[Slack Interactions] Thread marked as having Jira ticket');

  // Clean up pending request
  removePendingJiraRequest(requestId);
  console.log('[Slack Interactions] Removed pending request:', requestId);

  console.log('[Slack Interactions] Jira ticket queued for creation');
  console.log('[Slack Interactions] ===== JIRA MODAL SUBMISSION END =====');

  // Return success immediately - modal will close
  return NextResponse.json({ response_action: 'clear' });
  } catch (error) {
    console.error('[Slack Interactions] ERROR in handleJiraModalSubmission:', error);
    console.error('[Slack Interactions] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json({
      response_action: 'errors',
      errors: {
        ticket_title: 'An error occurred. Please try again.',
      },
    });
  }
}

/**
 * Handle "Create Task" button from Smart Inbox digest
 */
async function handleCreateTaskFromDigest(payload: any) {
  console.log('[Slack Interactions] ===== CREATE TASK FROM DIGEST =====');

  try {
    const action = payload.actions[0];
    const user = payload.user;
    const channel = payload.channel?.id;
    const messageTs = payload.message?.ts;

    console.log('[Slack Interactions] User:', user.id, user.username);
    console.log('[Slack Interactions] Action ID:', action.action_id);
    console.log('[Slack Interactions] Action value:', action.value);

    // Parse the value which contains message metadata
    const metadata = JSON.parse(action.value);
    console.log('[Slack Interactions] Metadata:', metadata);

    const { messageId, summary, channel: originalChannel, permalink } = metadata;

    // Create task data for PM-OS to pick up
    const taskId = `digest_${messageId}_${Date.now()}`;
    const taskData = {
      id: taskId,
      title: summary,
      description: `From Smart Inbox digest\n\nOriginal message: ${permalink || 'N/A'}`,
      channel: originalChannel,
      messageTs: messageId,
      user: user.id,
      teamId: payload.team?.id,
      timestamp: Date.now(),
      processed: false,
      source: 'smart_inbox',
      digestMessageId: messageId, // Track which digest message this came from
    };

    // Store in pending tasks
    addPendingTask(taskData);
    console.log('[Slack Interactions] Task queued:', taskId);

    // Update the digest message to show task was created
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (botToken) {
      try {
        // Update the button to show "✅ Task Created"
        const originalBlocks = payload.message.blocks;

        // Find and update the block with this button
        const updatedBlocks = originalBlocks.map((block: any) => {
          if (block.type === 'section' && block.accessory?.action_id === action.action_id) {
            return {
              ...block,
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ Task Created',
                },
                action_id: 'task_created_disabled',
                style: 'primary',
              },
            };
          }
          return block;
        });

        await fetch('https://slack.com/api/chat.update', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channel,
            ts: messageTs,
            blocks: updatedBlocks,
          }),
        });

        console.log('[Slack Interactions] Updated digest message to show task created');
      } catch (error) {
        console.error('[Slack Interactions] Failed to update message:', error);
      }
    }

    console.log('[Slack Interactions] ===== CREATE TASK SUCCESS =====');

    // Acknowledge the interaction
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Interactions] ERROR in handleCreateTaskFromDigest:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
