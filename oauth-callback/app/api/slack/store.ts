// Shared in-memory store for pending tasks
// NOTE: This will work within a single serverless function instance
// For production across multiple instances, use Vercel KV or Upstash Redis

export const pendingTasks: Map<string, any> = new Map();
export const processedTaskIds: Set<string> = new Set();

export function addPendingTask(taskData: any) {
  // Check if task was already processed to prevent duplicates
  if (processedTaskIds.has(taskData.id)) {
    console.log('[Store] Task was already processed, skipping:', taskData.id);
    return;
  }

  // Check if task already exists in pending queue
  if (pendingTasks.has(taskData.id)) {
    console.log('[Store] Task already in pending queue, skipping:', taskData.id);
    return;
  }

  pendingTasks.set(taskData.id, taskData);
  console.log('[Store] Added pending task:', taskData.id);

  // Clean up old tasks (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [id, task] of pendingTasks.entries()) {
    if (task.timestamp < oneHourAgo) {
      pendingTasks.delete(id);
      console.log('[Store] Cleaned up old task:', id);
    }
  }
}

export function getPendingTasks() {
  // Filter out any tasks that were already processed
  return Array.from(pendingTasks.values()).filter(task =>
    !task.processed && !processedTaskIds.has(task.id)
  );
}

export function markTaskProcessed(taskId: string) {
  const task = pendingTasks.get(taskId);
  if (task) {
    task.processed = true;
    pendingTasks.set(taskId, task);
    // Add to processed set to prevent reprocessing
    processedTaskIds.add(taskId);
    console.log('[Store] Marked task as processed:', taskId);
  }
}
