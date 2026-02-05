import { NextRequest, NextResponse } from 'next/server';
import { addPendingJiraRequest } from '../store';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const {
      requestId,
      title,
      description,
      assigneeName,
      assigneeEmail,
      reporterName,
      reporterEmail,
      parent,
      priority,
      pillar,
      pod,
      channel,
      messageTs,
      threadTs,
      user,
      teamId,
    } = data;

    console.log('[Jira Confirmation] Received request:', requestId);
    console.log('[Jira Confirmation] Assignee info:', { assigneeName, assigneeEmail });
    console.log('[Jira Confirmation] Reporter info:', { reporterName, reporterEmail });

    // Fetch field options from Jira
    let pillarOptions: Array<{ id: string; value: string }> = [];
    let podOptions: Array<{ id: string; value: string }> = [];

    try {
      const optionsResponse = await fetch('http://localhost:54321/jira-field-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: 'AMP' }),
      });

      if (optionsResponse.ok) {
        const optionsData = await optionsResponse.json();
        pillarOptions = optionsData.pillars || [];
        podOptions = optionsData.pods || [];
        console.log('[Jira Confirmation] Fetched field options:', {
          pillarCount: pillarOptions.length,
          podCount: podOptions.length
        });
      }
    } catch (error) {
      console.error('[Jira Confirmation] Failed to fetch field options:', error);
    }

    // Store the request data
    addPendingJiraRequest(requestId, {
      title,
      description,
      assigneeName,
      assigneeEmail,
      reporterName,
      reporterEmail,
      parent,
      priority,
      pillar,
      pod,
      channel,
      messageTs,
      threadTs,
      user,
      teamId,
      pillarOptions,
      podOptions,
    });

    // Send Slack message with button
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      console.error('[Jira Confirmation] No bot token');
      return NextResponse.json({ success: false, error: 'No bot token' }, { status: 500 });
    }

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Ready to create Jira ticket: *${title}*\n\n` +
                `*Parent:* ${parent || 'None'}\n` +
                `*Priority:* ${priority}\n` +
                `*Assignee:* ${assigneeName || assigneeEmail || 'Unassigned'}\n` +
                `*Pillar:* ${pillar} | *Pod:* ${pod}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📝 Review & Create Ticket',
            },
            style: 'primary',
            action_id: 'open_jira_modal',
            value: requestId,
          },
        ],
      },
    ];

    // Use chat.postEphemeral to make message visible only to the user who summoned PM-OS
    const response = await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        user, // Only this user will see the message
        thread_ts: threadTs,
        blocks,
        text: `Ready to create Jira ticket: ${title}`,
      }),
    });

    const slackData = await response.json();
    if (!slackData.ok) {
      console.error('[Jira Confirmation] Failed to send message:', slackData.error);
      return NextResponse.json({ success: false, error: slackData.error }, { status: 500 });
    }

    console.log('[Jira Confirmation] Button sent successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Jira Confirmation] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
