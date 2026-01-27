import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const store = new Store();

const VERCEL_API_URL = 'https://pm-os-git-main-amplitude-inc.vercel.app/api/slack';

// Set up file logging
const logFilePath = path.join(os.homedir(), 'pm-os-jira-debug.log');
function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(logFilePath, logMessage + '\n');
  console.log(message); // Also log to console
}
function logErrorToFile(message: string, error?: any) {
  const timestamp = new Date().toISOString();
  const errorMsg = error ? ` ${JSON.stringify(error)}` : '';
  const logMessage = `[${timestamp}] ERROR: ${message}${errorMsg}`;
  fs.appendFileSync(logFilePath, logMessage + '\n');
  logErrorToFile(message, error); // Also log to console
}

export class SlackEventsServer {
  private pollingInterval: NodeJS.Timeout | null = null;
  private onTaskCreate?: (task: any) => Promise<void>;
  private onJiraCreate?: (request: { summary: string; description?: string; assigneeName?: string; assigneeEmail?: string; parent?: string; priority?: string; pillar?: string; pod?: string }) => Promise<{ key: string; url: string }>;
  private onConfluenceCreate?: (request: { title: string; body: string; spaceKey?: string; parentId?: string }) => Promise<{ id: string; url: string }>;
  private isPolling: boolean = false;
  private processedThreads: Set<string> = new Set();

  constructor() {
    // Load previously processed threads from persistent storage
    const stored = store.get('processed_slack_threads') as string[] | undefined;
    if (stored && Array.isArray(stored)) {
      this.processedThreads = new Set(stored);
      logToFile(`[SlackEvents] Loaded ${this.processedThreads.size} previously processed thread(s) from storage`);
    }
  }

  setTaskCreateHandler(handler: (task: any) => Promise<void>) {
    this.onTaskCreate = handler;
  }

  setJiraCreateHandler(handler: (request: { summary: string; description?: string; assigneeName?: string; assigneeEmail?: string; parent?: string; priority?: string; pillar?: string; pod?: string }) => Promise<{ key: string; url: string }>) {
    this.onJiraCreate = handler;
  }

  setConfluenceCreateHandler(handler: (request: { title: string; body: string; spaceKey?: string; parentId?: string }) => Promise<{ id: string; url: string }>) {
    this.onConfluenceCreate = handler;
  }

  async start(): Promise<void> {
    logToFile('[SlackEvents] Starting Slack events polling...');
    logToFile('[SlackEvents] Polling Vercel endpoint: ' + VERCEL_API_URL);

    // Start polling every 10 seconds
    this.pollingInterval = setInterval(() => {
      this.pollPendingTasks();
    }, 10000);

    // Do initial poll immediately
    await this.pollPendingTasks();
  }

  async stop(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logToFile('[SlackEvents] Stopped polling');
    }
  }

  private saveProcessedThreads(): void {
    // Save to persistent storage
    const threadsArray = Array.from(this.processedThreads);
    store.set('processed_slack_threads', threadsArray);
    logToFile(`[SlackEvents] Saved ${threadsArray.length} processed thread(s) to storage`);
  }

  private async pollPendingTasks(): Promise<void> {
    if (this.isPolling) {
      // Skip if already polling
      return;
    }

    this.isPolling = true;

    try {
      const response = await fetch(`${VERCEL_API_URL}/pending-tasks`);
      const data = await response.json();

      if (data.success && data.tasks && data.tasks.length > 0) {
        logToFile(`[SlackEvents] Found ${data.tasks.length} pending task(s)`);

        for (const taskData of data.tasks) {
          await this.processTask(taskData);

          // Mark task as processed
          await fetch(`${VERCEL_API_URL}/pending-tasks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ taskId: taskData.id }),
          });
        }
      }
    } catch (error) {
      logErrorToFile('[SlackEvents] Error polling pending tasks:', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async processTask(taskData: any): Promise<void> {
    try {
      let { title, description, channel, messageTs, threadTs, user, teamId, shouldCreateJira, shouldCreateConfluence, assigneeName, assigneeEmail } = taskData;
      let jiraTicket: { key: string; url: string } | null = null;
      let confluencePage: { id: string; url: string } | null = null;

      // CRITICAL: Only allow ONE Jira ticket per Slack thread
      // Use threadTs (or messageTs if no thread) as the unique identifier
      const threadId = `${channel}_${threadTs || messageTs}`;

      if (this.processedThreads.has(threadId)) {
        logToFile(`[SlackEvents] SKIPPING - Thread already processed: ${threadId}`);
        return;
      }

      logToFile('[SlackEvents] Processing task: ' + JSON.stringify({ title, threadId, shouldCreateJira, shouldCreateConfluence, assigneeName, assigneeEmail, hasJiraHandler: !!this.onJiraCreate, hasConfluenceHandler: !!this.onConfluenceCreate }));

      // CRITICAL: Prevent recursive loops - ignore PM-OS's own reply messages
      const fullMessage = `${title} ${description || ''}`.toLowerCase();
      if (fullMessage.includes('jira ticket created') ||
          fullMessage.includes('confluence page created') ||
          fullMessage.includes('task created:') ||
          title.startsWith('🎫') ||
          title.startsWith('📄') ||
          title.startsWith('✅')) {
        logToFile('[SlackEvents] Skipping PM-OS bot reply message to prevent recursion');
        return;
      }

      // Mark this thread as processed IMMEDIATELY to prevent race conditions
      this.processedThreads.add(threadId);
      this.saveProcessedThreads();

      // Eyes emoji already added by Vercel webhook for immediate feedback
      // We just need to process the task and update to checkmark

      // Build permalink to the message first (we need it for Jira)
      // Convert timestamp (e.g., "1234567890.123456") to message ID (e.g., "p1234567890123456")
      const messageId = 'p' + messageTs.replace('.', '');
      const permalink = `slack://channel?team=${teamId}&id=${channel}&message=${messageId}`;

      // Create Jira ticket if requested and handler is available
      if (shouldCreateJira) {
        if (!this.onJiraCreate) {
          logErrorToFile('[SlackEvents] Jira creation requested but handler not set');
          description = `Failed to create Jira ticket: Handler not configured\n\nOriginal context:\n${description}`;
        } else {
          try {
            logToFile('[SlackEvents] Creating Jira ticket with title: ' + title + (assigneeName ? ' (assignee: ' + assigneeName + (assigneeEmail ? ' <' + assigneeEmail + '>' : '') + ')' : ''));

            // Parse additional fields from the message
            const fullMessage = `${title} ${description || ''}`.toLowerCase();

            // Extract parent ticket (e.g., "parent AMP-144806" or "parent: AMP-144806")
            let parent: string | undefined;
            const parentMatch = fullMessage.match(/parent[:\s]+([a-z]+-\d+)/i);
            if (parentMatch) {
              parent = parentMatch[1].toUpperCase();
              logToFile('[SlackEvents] Extracted parent: ' + parent);
            }

            // Extract priority (e.g., "medium priority", "high priority", "low priority")
            let priority: string | undefined;
            if (fullMessage.includes('highest priority') || fullMessage.includes('critical priority')) {
              priority = 'Highest';
            } else if (fullMessage.includes('high priority')) {
              priority = 'High';
            } else if (fullMessage.includes('medium priority')) {
              priority = 'Medium';
            } else if (fullMessage.includes('low priority')) {
              priority = 'Low';
            } else if (fullMessage.includes('lowest priority')) {
              priority = 'Lowest';
            }
            if (priority) {
              logToFile('[SlackEvents] Extracted priority: ' + priority);
            }

            // Default to Growth/Retention
            const pillar = 'Growth';
            const pod = 'Retention';

            // Add Slack thread link to Jira description
            const jiraDescription = description ? `${description}\n\n---\n\nSlack thread: ${permalink}` : `Slack thread: ${permalink}`;

            jiraTicket = await this.onJiraCreate({
              summary: title,
              description: jiraDescription,
              assigneeName: assigneeName,
              assigneeEmail: assigneeEmail,
              parent: parent,
              priority: priority,
              pillar: pillar,
              pod: pod,
            });
            logToFile('[SlackEvents] Jira ticket created successfully: ' + JSON.stringify(jiraTicket));

            // Don't modify the task - just create the Jira ticket
            // User doesn't want "Validate" tasks created
          } catch (jiraError) {
            logErrorToFile('[SlackEvents] Failed to create Jira ticket:', jiraError);
            description = `Failed to create Jira ticket: ${(jiraError as any).message}\n\nOriginal context:\n${description}`;
          }
        }
      } else {
        logToFile('[SlackEvents] Jira creation not requested for this task');
      }

      // Create Confluence page if requested and handler is available
      if (shouldCreateConfluence) {
        if (!this.onConfluenceCreate) {
          logErrorToFile('[SlackEvents] Confluence page creation requested but handler not set');
          description = `Failed to create Confluence page: Handler not configured\n\nOriginal context:\n${description}`;
        } else {
          try {
            logToFile('[SlackEvents] Creating Confluence page with title: ' + title);

            // Add Slack thread link to page body
            const pageBody = description ? `${description}\n\n---\n\nSlack thread: ${permalink}` : `Slack thread: ${permalink}`;

            confluencePage = await this.onConfluenceCreate({
              title: title,
              body: pageBody,
            });
            logToFile('[SlackEvents] Confluence page created successfully: ' + JSON.stringify(confluencePage));

            // Update description to include Confluence link
            description = `Confluence page created\n\n${confluencePage.url}`;
            logToFile('[SlackEvents] Confluence page created, continuing to create task');
          } catch (confluenceError) {
            logErrorToFile('[SlackEvents] Failed to create Confluence page:', confluenceError);
            description = `Failed to create Confluence page: ${(confluenceError as any).message}\n\nOriginal context:\n${description}`;
          }
        }
      } else {
        logToFile('[SlackEvents] Confluence page creation not requested for this task');
      }

      // Build linked items array
      const linkedItems: any[] = [{
        id: `slack_${channel}_${messageTs}`,
        type: 'slack' as const,
        title: 'Slack Message',
        url: permalink,
      }];

      // Add Jira ticket if it was created
      if (jiraTicket) {
        linkedItems.push({
          id: `jira_${jiraTicket.key}`,
          type: 'jira' as const,
          title: `Jira: ${jiraTicket.key}`,
          url: jiraTicket.url,
        });
      }

      // Add Confluence page if it was created
      if (confluencePage) {
        linkedItems.push({
          id: `confluence_${confluencePage.id}`,
          type: 'confluence' as const,
          title: 'Confluence Page',
          url: confluencePage.url,
        });
      }

      // Only create a PM-OS task if:
      // 1. User didn't request Jira/Confluence, OR
      // 2. Jira/Confluence creation failed
      const shouldCreateTask = (!shouldCreateJira && !shouldCreateConfluence) ||
                               (shouldCreateJira && !jiraTicket) ||
                               (shouldCreateConfluence && !confluencePage);

      if (shouldCreateTask) {
        // Create the task
        const task = {
          title,
          description: description || undefined,
          source: 'slack',
          sourceId: `${channel}_${messageTs}`,
          priority: 'medium',
          context: `From Slack: ${user}`,
          linkedItems,
        };

        logToFile('[SlackEvents] Creating task: ' + JSON.stringify({ title: task.title, hasDescription: !!task.description }));

        // Call the task creation handler
        if (this.onTaskCreate) {
          await this.onTaskCreate(task);
        }
      } else {
        logToFile('[SlackEvents] Skipping task creation - Jira or Confluence was successfully created');
      }

      // Send confirmation reply in Slack
      let confirmMessage = '';

      if (shouldCreateTask) {
        confirmMessage = `✅ Task created: "${title}"`;
      }

      if (jiraTicket) {
        if (confirmMessage) confirmMessage += '\n\n';
        confirmMessage += `🎫 Jira ticket created: <${jiraTicket.url}|${jiraTicket.key}>`;
      }

      if (confluencePage) {
        if (confirmMessage) confirmMessage += '\n\n';
        confirmMessage += `📄 Confluence page created: <${confluencePage.url}|View page>`;
      }

      await this.sendSlackReply(channel, threadTs, confirmMessage);

      // Replace eyes with green checkmark
      logToFile('[SlackEvents] Attempting to remove eyes emoji from message');
      await this.removeReaction(channel, messageTs, 'eyes');
      logToFile('[SlackEvents] Eyes emoji removed, adding checkmark');
      await this.addReaction(channel, messageTs, 'white_check_mark');
      logToFile('[SlackEvents] Checkmark added successfully');
    } catch (error) {
      logErrorToFile('[SlackEvents] Error processing task:', error);
    }
  }

  private async sendSlackReply(channel: string, threadTs: string, text: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        logErrorToFile('[SlackEvents] No bot token found');
        return;
      }

      const response = await fetch(`${VERCEL_API_URL}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          threadTs,
          text,
          botToken,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        logErrorToFile('[SlackEvents] Failed to send reply:', data.error);
      }
    } catch (error) {
      logErrorToFile('[SlackEvents] Error sending Slack reply:', error);
    }
  }

  private async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        logErrorToFile('[SlackEvents] No bot token found');
        return;
      }

      const response = await fetch('https://slack.com/api/reactions.add', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          timestamp,
          name: emoji,
        }),
      });

      const data = await response.json();
      logToFile(`[SlackEvents] Add reaction response: ${JSON.stringify(data)}`);
      if (!data.ok) {
        logErrorToFile('[SlackEvents] Failed to add reaction:', data.error);
      }
    } catch (error) {
      logErrorToFile('[SlackEvents] Error adding reaction:', error);
    }
  }

  private async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        logErrorToFile('[SlackEvents] No bot token found');
        return;
      }

      const response = await fetch('https://slack.com/api/reactions.remove', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          timestamp,
          name: emoji,
        }),
      });

      const data = await response.json();
      logToFile(`[SlackEvents] Remove reaction response: ${JSON.stringify(data)}`);
      if (!data.ok) {
        logErrorToFile('[SlackEvents] Failed to remove reaction:', data.error);
      }
    } catch (error) {
      logErrorToFile('[SlackEvents] Error removing reaction:', error);
    }
  }
}
