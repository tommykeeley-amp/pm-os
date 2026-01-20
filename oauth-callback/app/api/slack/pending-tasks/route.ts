import { NextRequest, NextResponse } from 'next/server';
import { getPendingTasks, markTaskProcessed } from '../store';

export async function GET(request: NextRequest) {
  try {
    const tasks = getPendingTasks();
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
