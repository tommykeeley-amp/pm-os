import Store from 'electron-store';

const store = new Store();

const VERCEL_API_URL = 'https://pm-os-git-main-amplitude-inc.vercel.app/api/slack';

export class SlackEventsServer {
  private pollingInterval: NodeJS.Timeout | null = null;
  private onTaskCreate?: (task: any) => Promise<void>;
  private onJiraCreate?: (request: { summary: string; description?: string }) => Promise<{ key: string; url: string }>;
  private isPolling: boolean = false;

  constructor() {}

  setTaskCreateHandler(handler: (task: any) => Promise<void>) {
    this.onTaskCreate = handler;
  }

  setJiraCreateHandler(handler: (request: { summary: string; description?: string }) => Promise<{ key: string; url: string }>) {
    this.onJiraCreate = handler;
  }

  async start(): Promise<void> {
    console.log('[SlackEvents] Starting Slack events polling...');
    console.log('[SlackEvents] Polling Vercel endpoint:', VERCEL_API_URL);

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
      console.log('[SlackEvents] Stopped polling');
    }
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
        console.log(`[SlackEvents] Found ${data.tasks.length} pending task(s)`);

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
      console.error('[SlackEvents] Error polling pending tasks:', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async processTask(taskData: any): Promise<void> {
    try {
      let { title, description, channel, messageTs, threadTs, user, teamId, shouldCreateJira } = taskData;
      let jiraTicket: { key: string; url: string } | null = null;

      console.log('[SlackEvents] Processing task:', { title, shouldCreateJira, hasJiraHandler: !!this.onJiraCreate });

      // Eyes emoji already added by Vercel webhook for immediate feedback
      // We just need to process the task and update to checkmark

      // Create Jira ticket if requested and handler is available
      if (shouldCreateJira) {
        if (!this.onJiraCreate) {
          console.error('[SlackEvents] Jira creation requested but handler not set');
          description = `Failed to create Jira ticket: Handler not configured\n\nOriginal context:\n${description}`;
        } else {
          try {
            console.log('[SlackEvents] Creating Jira ticket with title:', title);
            jiraTicket = await this.onJiraCreate({
              summary: title,
              description: description,
            });
            console.log('[SlackEvents] Jira ticket created successfully:', jiraTicket);

            // Update task to be about validating the Jira ticket
            title = `Validate Jira ticket: ${jiraTicket.key}`;
            description = `Review and validate the Jira ticket that was created:\n\n${description}\n\nJira ticket: ${jiraTicket.url}`;
          } catch (jiraError) {
            console.error('[SlackEvents] Failed to create Jira ticket:', jiraError);
            description = `Failed to create Jira ticket: ${(jiraError as any).message}\n\nOriginal context:\n${description}`;
          }
        }
      } else {
        console.log('[SlackEvents] Jira creation not requested for this task');
      }

      // Build permalink to the message
      // Convert timestamp (e.g., "1234567890.123456") to message ID (e.g., "p1234567890123456")
      const messageId = 'p' + messageTs.replace('.', '');
      const permalink = `slack://channel?team=${teamId}&id=${channel}&message=${messageId}`;

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

      console.log('[SlackEvents] Creating task:', task);

      // Call the task creation handler
      if (this.onTaskCreate) {
        await this.onTaskCreate(task);
      }

      // Send confirmation reply in Slack
      let confirmMessage = `✅ Task created: "${title}"`;
      if (jiraTicket) {
        confirmMessage += `\n\n🎫 Jira ticket created: <${jiraTicket.url}|${jiraTicket.key}>`;
      }
      await this.sendSlackReply(channel, threadTs, confirmMessage);

      // Replace eyes with green checkmark
      await this.removeReaction(channel, messageTs, 'eyes');
      await this.addReaction(channel, messageTs, 'white_check_mark');
    } catch (error) {
      console.error('[SlackEvents] Error processing task:', error);
    }
  }

  private async sendSlackReply(channel: string, threadTs: string, text: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        console.error('[SlackEvents] No bot token found');
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
        console.error('[SlackEvents] Failed to send reply:', data.error);
      }
    } catch (error) {
      console.error('[SlackEvents] Error sending Slack reply:', error);
    }
  }

  private async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        console.error('[SlackEvents] No bot token found');
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
      if (!data.ok) {
        console.error('[SlackEvents] Failed to add reaction:', data.error);
      }
    } catch (error) {
      console.error('[SlackEvents] Error adding reaction:', error);
    }
  }

  private async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        console.error('[SlackEvents] No bot token found');
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
      if (!data.ok) {
        console.error('[SlackEvents] Failed to remove reaction:', data.error);
      }
    } catch (error) {
      console.error('[SlackEvents] Error removing reaction:', error);
    }
  }
}
