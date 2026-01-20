import Store from 'electron-store';

const store = new Store();

const VERCEL_API_URL = 'https://pm-os-git-main-amplitude-inc.vercel.app/api/slack';

export class SlackEventsServer {
  private pollingInterval: NodeJS.Timeout | null = null;
  private onTaskCreate?: (task: any) => Promise<void>;
  private isPolling: boolean = false;

  constructor() {}

  setTaskCreateHandler(handler: (task: any) => Promise<void>) {
    this.onTaskCreate = handler;
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
      const { title, channel, messageTs, threadTs, user, teamId } = taskData;

      // Build permalink to the message
      // Convert timestamp (e.g., "1234567890.123456") to message ID (e.g., "p1234567890123456")
      const messageId = 'p' + messageTs.replace('.', '');
      const permalink = `slack://channel?team=${teamId}&id=${channel}&message=${messageId}`;

      // Create the task
      const task = {
        title,
        source: 'slack',
        sourceId: `${channel}_${messageTs}`,
        priority: 'medium',
        context: `From Slack: ${user}`,
        linkedItems: [{
          id: `slack_${channel}_${messageTs}`,
          type: 'slack' as const,
          title: 'Slack Message',
          url: permalink,
        }],
      };

      console.log('[SlackEvents] Creating task:', task);

      // Call the task creation handler
      if (this.onTaskCreate) {
        await this.onTaskCreate(task);
      }

      // Send confirmation reply in Slack (no reactions to avoid clutter)
      await this.sendSlackReply(channel, threadTs, `✅ Task created: "${title}"`);
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

  // Removed reaction methods since we no longer add reactions to messages
}
