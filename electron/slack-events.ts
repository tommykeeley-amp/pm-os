import * as http from 'http';
import Store from 'electron-store';

const store = new Store();

export class SlackEventsServer {
  private server: http.Server | null = null;
  private port: number = 3001;
  private onTaskCreate?: (task: any) => Promise<void>;

  constructor(port: number = 3001) {
    this.port = port;
  }

  setTaskCreateHandler(handler: (task: any) => Promise<void>) {
    this.onTaskCreate = handler;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/slack/events') {
          let body = '';

          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const payload = JSON.parse(body);

              // Handle URL verification challenge
              if (payload.type === 'url_verification') {
                console.log('[SlackEvents] Handling URL verification');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(payload.challenge);
                return;
              }

              // Handle app mention events
              if (payload.type === 'event_callback' && payload.event?.type === 'app_mention') {
                console.log('[SlackEvents] Received app mention:', payload.event);

                // Acknowledge immediately
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));

                // Process the mention asynchronously
                await this.handleAppMention(payload.event);
                return;
              }

              // Default response
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (error) {
              console.error('[SlackEvents] Error processing event:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal server error' }));
            }
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.server.listen(this.port, () => {
        console.log(`[SlackEvents] Server listening on port ${this.port}`);
        console.log(`[SlackEvents] Webhook URL: http://localhost:${this.port}/slack/events`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('[SlackEvents] Server error:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('[SlackEvents] Server stopped');
          resolve();
        });
      });
    }
  }

  private async handleAppMention(event: any): Promise<void> {
    try {
      const text = event.text.toLowerCase();
      const channel = event.channel;
      const messageTs = event.ts;
      const threadTs = event.thread_ts || event.ts;

      // Check if the message contains task creation keywords
      if (text.includes('make a task') || text.includes('create a task') || text.includes('add a task')) {
        // Extract task title from the message
        // Remove the bot mention and command words
        let taskTitle = event.text
          .replace(/<@[A-Z0-9]+>/gi, '') // Remove mentions
          .replace(/make a task for/gi, '')
          .replace(/create a task for/gi, '')
          .replace(/add a task for/gi, '')
          .replace(/make a task/gi, '')
          .replace(/create a task/gi, '')
          .replace(/add a task/gi, '')
          .trim();

        // If there's a colon, use everything after it as the task title
        if (taskTitle.includes(':')) {
          taskTitle = taskTitle.split(':').slice(1).join(':').trim();
        }

        // If task title is empty, use a default
        if (!taskTitle || taskTitle.length === 0) {
          taskTitle = 'Task from Slack';
        }

        // Get workspace info to build permalink
        const slackTokens = store.get('slack_bot_token') as any;
        const workspaceUrl = slackTokens?.team_url || 'https://slack.com';

        // Build permalink to the message
        const permalink = `${workspaceUrl}/archives/${channel}/p${messageTs.replace('.', '')}`;

        // Create the task
        const task = {
          title: taskTitle,
          source: 'slack',
          sourceId: `${channel}_${messageTs}`,
          priority: 'medium',
          context: `From Slack: ${event.user}`,
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

        // Send confirmation reply in Slack
        await this.sendSlackReply(channel, threadTs, `✅ Task created: "${taskTitle}"`);
      }
    } catch (error) {
      console.error('[SlackEvents] Error handling app mention:', error);
    }
  }

  private async sendSlackReply(channel: string, threadTs: string, text: string): Promise<void> {
    try {
      const botToken = store.get('slack_bot_token') as string;
      if (!botToken) {
        console.error('[SlackEvents] No bot token found');
        return;
      }

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          thread_ts: threadTs,
          text,
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        console.error('[SlackEvents] Failed to send reply:', data.error);
      }
    } catch (error) {
      console.error('[SlackEvents] Error sending Slack reply:', error);
    }
  }
}
