import { NextRequest, NextResponse } from 'next/server';
import { addPendingJiraRequest, getPendingJiraRequest, removePendingJiraRequest, addPendingTask, markThreadHasJiraTicket } from '../store';

export async function POST(request: NextRequest) {
  try {
    console.log('[Test Modal] Starting test modal submission simulation');

    // Create a test request
    const testRequestId = 'test_' + Date.now();
    const testData = {
      title: 'Test Jira Ticket',
      description: 'Test description',
      assigneeName: 'Test User',
      assigneeEmail: 'test@example.com',
      parent: 'AMP-12345',
      priority: 'High',
      pillar: 'Growth',
      pod: 'Retention',
      channel: 'C0TEST',
      messageTs: '1234567890.123456',
      threadTs: '1234567890.123456',
      user: 'U0TEST',
      teamId: 'T0TEST',
    };

    // Add it as a pending Jira request
    addPendingJiraRequest(testRequestId, testData);
    console.log('[Test Modal] Added pending Jira request');

    // Simulate what handleJiraModalSubmission does
    const requestData = getPendingJiraRequest(testRequestId);
    console.log('[Test Modal] Retrieved request data:', !!requestData);

    if (!requestData) {
      return NextResponse.json({ error: 'Request not found' });
    }

    // Create the task
    const taskData = {
      id: `${requestData.channel}_${requestData.messageTs}_jira_confirmed`,
      title: requestData.title,
      description: requestData.description,
      channel: requestData.channel,
      messageTs: requestData.messageTs,
      threadTs: requestData.threadTs,
      user: requestData.user,
      teamId: requestData.teamId,
      timestamp: Date.now(),
      processed: false,
      shouldCreateJira: true,
      shouldCreateConfluence: false,
      assigneeName: requestData.assigneeName,
      assigneeEmail: requestData.assigneeEmail,
      parent: requestData.parent,
      priority: requestData.priority,
      pillar: requestData.pillar,
      pod: requestData.pod,
    };

    console.log('[Test Modal] Creating task:', taskData.id);
    addPendingTask(taskData);
    console.log('[Test Modal] Task added');

    // Mark thread as having Jira
    const threadKey = `${requestData.channel}_${requestData.threadTs || requestData.messageTs}`;
    markThreadHasJiraTicket(threadKey);
    console.log('[Test Modal] Thread marked');

    // Clean up
    removePendingJiraRequest(testRequestId);
    console.log('[Test Modal] Cleanup complete');

    return NextResponse.json({
      success: true,
      message: 'Test modal submission completed',
      taskId: taskData.id,
    });
  } catch (error) {
    console.error('[Test Modal] Error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
