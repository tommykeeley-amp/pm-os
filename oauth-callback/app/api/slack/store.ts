// Shared in-memory store for pending tasks
// NOTE: This will work within a single serverless function instance
// For production across multiple instances, use Vercel KV or Upstash Redis

export const pendingTasks: Map<string, any> = new Map();
export const processedTaskIds: Set<string> = new Set();
export const threadsWithJiraTickets: Set<string> = new Set(); // Track threads that already have Jira tickets
export const threadsWithConfluenceDocs: Set<string> = new Set(); // Track threads that already have Confluence docs
export const pendingConfluenceRequests: Map<string, any> = new Map(); // Track pending Confluence requests awaiting modal input
export const pendingJiraRequests: Map<string, any> = new Map(); // Track pending Jira requests awaiting modal confirmation

export function addPendingTask(taskData: any) {
  console.log('[Store] ===== ADD PENDING TASK CALLED =====');
  console.log('[Store] Task ID:', taskData.id);
  console.log('[Store] Task title:', taskData.title);
  console.log('[Store] shouldCreateJira:', taskData.shouldCreateJira);

  // Check if task was already processed to prevent duplicates
  if (processedTaskIds.has(taskData.id)) {
    console.log('[Store] Task was already processed, skipping:', taskData.id);
    console.log('[Store] Processed task IDs:', Array.from(processedTaskIds));
    return;
  }

  // Check if task already exists in pending queue
  if (pendingTasks.has(taskData.id)) {
    console.log('[Store] Task already in pending queue, skipping:', taskData.id);
    return;
  }

  pendingTasks.set(taskData.id, taskData);
  console.log('[Store] Added pending task:', taskData.id);
  console.log('[Store] Total pending tasks:', pendingTasks.size);
  console.log('[Store] ===== ADD PENDING TASK COMPLETE =====');

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

export function hasThreadJiraTicket(threadKey: string): boolean {
  return threadsWithJiraTickets.has(threadKey);
}

export function markThreadHasJiraTicket(threadKey: string) {
  threadsWithJiraTickets.add(threadKey);
  console.log('[Store] Marked thread as having Jira ticket:', threadKey);
}

export function hasThreadConfluenceDoc(threadKey: string): boolean {
  return threadsWithConfluenceDocs.has(threadKey);
}

export function markThreadHasConfluenceDoc(threadKey: string) {
  threadsWithConfluenceDocs.add(threadKey);
  console.log('[Store] Marked thread as having Confluence doc:', threadKey);
}

export function addPendingConfluenceRequest(requestId: string, data: any) {
  pendingConfluenceRequests.set(requestId, {
    ...data,
    timestamp: Date.now(),
  });
  console.log('[Store] Added pending Confluence request:', requestId);

  // Clean up old requests (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [id, request] of pendingConfluenceRequests.entries()) {
    if (request.timestamp < oneHourAgo) {
      pendingConfluenceRequests.delete(id);
      console.log('[Store] Cleaned up old Confluence request:', id);
    }
  }
}

export function getPendingConfluenceRequest(requestId: string) {
  return pendingConfluenceRequests.get(requestId);
}

export function removePendingConfluenceRequest(requestId: string) {
  pendingConfluenceRequests.delete(requestId);
  console.log('[Store] Removed pending Confluence request:', requestId);
}

export function addPendingJiraRequest(requestId: string, data: any) {
  pendingJiraRequests.set(requestId, {
    ...data,
    timestamp: Date.now(),
  });
  console.log('[Store] Added pending Jira request:', requestId);

  // Clean up old requests (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [id, request] of pendingJiraRequests.entries()) {
    if (request.timestamp < oneHourAgo) {
      pendingJiraRequests.delete(id);
      console.log('[Store] Cleaned up old Jira request:', id);
    }
  }
}

export function getPendingJiraRequest(requestId: string) {
  return pendingJiraRequests.get(requestId);
}

export function removePendingJiraRequest(requestId: string) {
  pendingJiraRequests.delete(requestId);
  console.log('[Store] Removed pending Jira request:', requestId);
}
