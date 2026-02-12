import { NextRequest, NextResponse } from 'next/server';
import { getPendingTasks, markTaskProcessed } from '../store';

export async function GET(request: NextRequest) {
  try {
    // Get email filter from query parameter
    const searchParams = request.nextUrl.searchParams;
    const email = searchParams.get('email')?.toLowerCase();

    let tasks = getPendingTasks();

    // Filter by email if provided
    if (email) {
      tasks = tasks.filter((task: any) => {
        const reporterEmail = task.reporterEmail?.toLowerCase() || task.user_email?.toLowerCase() || '';
        return reporterEmail === email;
      });
      console.log(`[Pending Tasks] Filtered to ${tasks.length} tasks for email: ${email}`);
    } else {
      console.log(`[Pending Tasks] No email filter, returning all ${tasks.length} tasks`);
    }

    return NextResponse.json({
      success: true,
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('[Pending Tasks] Error fetching tasks:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch pending tasks'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: 'taskId is required'
      }, { status: 400 });
    }

    markTaskProcessed(taskId);

    return NextResponse.json({
      success: true,
      message: 'Task marked as processed'
    });
  } catch (error) {
    console.error('[Pending Tasks] Error marking task as processed:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to mark task as processed'
    }, { status: 500 });
  }
}
