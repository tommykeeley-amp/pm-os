import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const store = new Store();

const VERCEL_API_URL = 'https://pm-os-git-main-amplitude-inc.vercel.app/api/slack';

// Generate unique request ID
function generateRequestId(): string {
  return `jira_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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
  private onJiraCreate?: (request: {
    summary: string;
    description?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    reporterName?: string;
    reporterEmail?: string;
    parent?: string;
    priority?: string;
    pillar?: string;
    pod?: string;
  }) => Promise<{ key: string; url: string }>;
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

  setJiraCreateHandler(handler: (request: {
    summary: string;
    description?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    reporterName?: string;
    reporterEmail?: string;
    parent?: string;
    priority?: string;
    pillar?: string;
    pod?: string;
  }) => Promise<{ key: string; url: string }>) {
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
      // Get user's Slack email from settings to filter tasks
      const userSettings = store.get('userSettings', {}) as any;
      const mySlackEmail = userSettings.email?.toLowerCase() || '';

      logToFile(`[SlackEvents] Polling for tasks (my email: ${mySlackEmail || 'not set'})`);

      const response = await fetch(`${VERCEL_API_URL}/pending-tasks`);
      const data = await response.json();

      if (data.success && data.tasks && data.tasks.length > 0) {
        logToFile(`[SlackEvents] Found ${data.tasks.length} pending task(s)`);

        // Filter tasks to only process ones for this user
        const myTasks = data.tasks.filter((task: any) => {
          // If user hasn't configured their email, process all tasks (backward compatibility)
          if (!mySlackEmail) {
            logToFile(`[SlackEvents] No email configured, processing all tasks`);
            return true;
          }

          // Check if task has requester email that matches our email
          const requesterEmail = task.reporterEmail?.toLowerCase() || task.user_email?.toLowerCase() || '';

          if (requesterEmail === mySlackEmail) {
            logToFile(`[SlackEvents] Task ${task.id} is for me (${mySlackEmail})`);
            return true;
          } else {
            logToFile(`[SlackEvents] Task ${task.id} is NOT for me (requester: ${requesterEmail || 'unknown'}, me: ${mySlackEmail})`);
            return false;
          }
        });

        logToFile(`[SlackEvents] Processing ${myTasks.length} of ${data.tasks.length} tasks for this user`);

        for (const taskData of myTasks) {
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
      let { title, description, channel, messageTs, threadTs, user, teamId, shouldCreateJira, shouldCreateConfluence, assigneeName, assigneeEmail, reporterName, reporterEmail, parent, priority, pillar, pod, source, digestMessageId } = taskData;
      let confluencePage: { id: string; url: string } | null = null;
      let jiraTicket: { key: string; url: string } | null = null;

      // CRITICAL: Only allow ONE Jira ticket per Slack thread
      // Use threadTs (or messageTs if no thread) as the unique identifier
      const threadId = `${channel}_${threadTs || messageTs}`;

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

      // Check if this is a confirmed Jira request (has all required fields)
      const isConfirmedJiraRequest = shouldCreateJira && !!(parent !== undefined || priority || pillar || pod);

      // Only check/mark processed threads for confirmed requests or non-Jira tasks
      // Initial Jira confirmation requests should NOT mark the thread as processed
      if (!shouldCreateJira || isConfirmedJiraRequest) {
        if (this.processedThreads.has(threadId)) {
          logToFile(`[SlackEvents] SKIPPING - Thread already processed: ${threadId}`);
          return;
        }

        // Mark this thread as processed IMMEDIATELY to prevent race conditions
        this.processedThreads.add(threadId);
        this.saveProcessedThreads();
        logToFile(`[SlackEvents] Marked thread as processed: ${threadId}`);
      } else {
        logToFile(`[SlackEvents] NOT marking thread as processed yet (initial Jira request)`);
      }

      // Eyes emoji already added by Vercel webhook for immediate feedback
      // We just need to process the task and update to checkmark

      // Build permalink to the message first (we need it for Jira)
      // Convert timestamp (e.g., "1234567890.123456") to message ID (e.g., "p1234567890123456")
      const messageId = 'p' + messageTs.replace('.', '');
      const permalink = `slack://channel?team=${teamId}&id=${channel}&message=${messageId}`;

      // Handle Jira creation
      if (shouldCreateJira) {
        // Check if this is a confirmed request (has parent/priority/pillar/pod set)
        // vs an initial request that needs confirmation
        const isConfirmedRequest = !!(parent !== undefined || priority || pillar || pod);

        if (isConfirmedRequest) {
          // This is a confirmed request from the modal - create the ticket now
          logToFile('[SlackEvents] Creating confirmed Jira ticket');

          if (!this.onJiraCreate) {
            logErrorToFile('[SlackEvents] Jira creation handler not set');
          } else {
            try {
              jiraTicket = await this.onJiraCreate({
                summary: title,
                description,
                assigneeName,
                assigneeEmail,
                reporterName,
                reporterEmail,
                parent,
                priority,
                pillar,
                pod,
              });
              logToFile('[SlackEvents] Jira ticket created successfully: ' + JSON.stringify(jiraTicket));
            } catch (jiraError) {
              logErrorToFile('[SlackEvents] Failed to create Jira ticket:', jiraError);
            }
          }
        } else {
          // This is an initial request - send confirmation button
          logToFile('[SlackEvents] Sending Jira confirmation button');

          // Parse additional fields from the message
          const fullMessage = `${title} ${description || ''}`.toLowerCase();

          // Extract parent ticket (e.g., "parent AMP-144806" or "parent: AMP-144806")
          let extractedParent: string | undefined;
          const parentMatch = fullMessage.match(/parent[:\s]+([a-z]+-\d+)/i);
          if (parentMatch) {
            extractedParent = parentMatch[1].toUpperCase();
            logToFile('[SlackEvents] Extracted parent: ' + extractedParent);
          }

          // Extract priority (e.g., "medium priority", "high priority", "low priority")
          let extractedPriority: string | undefined;
          if (fullMessage.includes('highest priority') || fullMessage.includes('critical priority')) {
            extractedPriority = 'Highest';
          } else if (fullMessage.includes('high priority')) {
            extractedPriority = 'High';
          } else if (fullMessage.includes('medium priority')) {
            extractedPriority = 'Medium';
          } else if (fullMessage.includes('low priority')) {
            extractedPriority = 'Low';
          } else if (fullMessage.includes('lowest priority')) {
            extractedPriority = 'Lowest';
          }
          if (extractedPriority) {
            logToFile('[SlackEvents] Extracted priority: ' + extractedPriority);
          }

          // Store request data for modal
          const requestId = generateRequestId();

          // Get default pillar and pod from user settings
          const userSettings = store.get('userSettings', {}) as any;
          const defaultPillar = userSettings.jiraDefaultPillar || '';
          const defaultPod = userSettings.jiraDefaultPod || '';

          logToFile(`[SlackEvents] Using user settings - defaultPillar: "${defaultPillar}", defaultPod: "${defaultPod}"`);

          const jiraRequestData = {
            requestId,
            title,
            description: description ? `${description}\n\n---\n\nSlack thread: ${permalink}` : `Slack thread: ${permalink}`,
            assigneeName,
            assigneeEmail,
            reporterName,
            reporterEmail,
            parent: extractedParent,
            priority: extractedPriority || 'Medium',
            pillar: defaultPillar,
            pod: defaultPod,
            channel,
            messageTs,
            threadTs,
            user,
            teamId,
          };

          // Send to Vercel to store and send button
          await fetch(`${VERCEL_API_URL}/jira-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jiraRequestData),
          });

          logToFile('[SlackEvents] Jira confirmation button sent');
          return; // Don't create any task
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

      // Add Confluence page if it was created
      if (confluencePage) {
        linkedItems.push({
          id: `confluence_${confluencePage.id}`,
          type: 'confluence' as const,
          title: 'Confluence Page',
          url: confluencePage.url,
        });
      }

      // Create a PM-OS task only if:
      // - User didn't request Jira or Confluence, OR
      // - Confluence was requested but failed
      const shouldCreateTask = (!shouldCreateJira && !shouldCreateConfluence) ||
                               (shouldCreateConfluence && !confluencePage);

      if (shouldCreateTask) {
        // Create the task
        const task: any = {
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
          const createdTask = await this.onTaskCreate(task);

          // If this task came from Smart Inbox digest, mark the message as having a task created
          if (source === 'smart_inbox' && digestMessageId) {
            logToFile(`[SlackEvents] Task created from Smart Inbox digest, marking message ${digestMessageId} as completed`);

            // Update digest state to mark this message as having a task created
            const Store = (await import('electron-store')).default;
            const store = new Store();
            const digestState = store.get('digestState', {
              lastSent: {},
              suggestedMessages: {},
              createdTasks: {},
            }) as any;

            // Mark message as having task created
            digestState.createdTasks[digestMessageId] = task.sourceId || task.title;
            store.set('digestState', digestState);

            logToFile(`[SlackEvents] Marked digest message ${digestMessageId} as having task created`);
          }
        }
      } else {
        logToFile('[SlackEvents] Skipping task creation - Jira or Confluence handling separately');
      }

      // Send confirmation reply in Slack
      let confirmMessage = '';

      if (jiraTicket) {
        confirmMessage = `🎫 Jira ticket created: <${jiraTicket.url}|${jiraTicket.key}>`;
      }

      if (shouldCreateTask) {
        if (confirmMessage) confirmMessage += '\n\n';
        confirmMessage += `✅ Task created: "${title}"`;
      }

      if (confluencePage) {
        if (confirmMessage) confirmMessage += '\n\n';
        confirmMessage += `📄 Confluence page created: <${confluencePage.url}|View page>`;
      }

      if (confirmMessage) {
        await this.sendSlackReply(channel, threadTs, confirmMessage);
      }

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
