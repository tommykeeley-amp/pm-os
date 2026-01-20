// Shared in-memory store for pending tasks
// NOTE: This will work within a single serverless function instance
// For production across multiple instances, use Vercel KV or Upstash Redis

export const pendingTasks: Map<string, any> = new Map();

export function addPendingTask(taskData: any) {
  pendingTasks.set(taskData.id, taskData);

  // Clean up old tasks (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [id, task] of pendingTasks.entries()) {
    if (task.timestamp < oneHourAgo) {
      pendingTasks.delete(id);
    }
  }
}

export function getPendingTasks() {
  return Array.from(pendingTasks.values()).filter(task => !task.processed);
}

export function markTaskProcessed(taskId: string) {
  const task = pendingTasks.get(taskId);
  if (task) {
    task.processed = true;
    pendingTasks.set(taskId, task);
  }
}
