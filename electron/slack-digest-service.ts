import Store from 'electron-store';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const store = new Store();

// Log file for debugging
const logFilePath = path.join(os.homedir(), 'pm-os-digest-debug.log');

function logToFile(message: string) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    fs.appendFileSync(logFilePath, logMessage + '\n');
    console.log(message);
  } catch (e) {
    console.error('logToFile failed:', e);
  }
}

interface SlackMessage {
  id: string;
  channel: string;
  channelName: string;
  user: string;
  userName: string;
  text: string;
  ts: string;
  threadTs?: string;
  permalink?: string;
}

interface ActionableItem {
  id: string; // Unique ID for this suggestion
  messageId: string; // Slack message ID (ts)
  channel: string;
  channelName: string;
  user: string;
  userName: string;
  text: string;
  summary: string; // AI-generated summary
  suggestedAction: string; // What the user should do
  priority: number; // 0-100 score
  permalink?: string;
  threadTs?: string;
  timestamp: number;
  reasons: string[]; // Why this is suggested (e.g., "From VIP contact", "Question directed at you")
}

interface DigestState {
  lastSent: { [time: string]: number }; // Track when each digest was last sent
  suggestedMessages: { [messageId: string]: number }; // messageId -> timestamp when suggested
  createdTasks: { [messageId: string]: string }; // messageId -> task ID that was created
}

export class SlackDigestService {
  private openai: OpenAI | null = null;
  private slackToken: string | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(openaiApiKey: string, slackToken?: string) {
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    }
    this.slackToken = slackToken || null;
    logToFile('[DigestService] Initialized');
  }

  /**
   * Start the digest service
   * Schedules digests for 9AM, 12PM, and 5PM in user's timezone
   */
  start() {
    const userSettings = store.get('userSettings', {}) as any;

    if (!userSettings.slackDailyDigestEnabled) {
      logToFile('[DigestService] Digest disabled in settings');
      return;
    }

    if (!this.openai) {
      logToFile('[DigestService] OpenAI not configured, cannot start digest');
      return;
    }

    if (!this.slackToken) {
      logToFile('[DigestService] Slack token not found, cannot start digest');
      return;
    }

    const timezone = userSettings.primaryTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    logToFile(`[DigestService] Starting with timezone: ${timezone}`);

    // Schedule for 9AM, 12PM, 5PM
    this.scheduleDigest('09:00', timezone);
    this.scheduleDigest('12:00', timezone);
    this.scheduleDigest('17:00', timezone);

    logToFile('[DigestService] Scheduled 3x daily digests');
  }

  /**
   * Stop the digest service
   */
  stop() {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
    logToFile('[DigestService] Stopped');
  }

  /**
   * Schedule a digest for a specific time
   */
  private scheduleDigest(time: string, _timezone: string) {
    const [hours, minutes] = time.split(':').map(Number);

    const scheduleNext = () => {
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
      }

      const msUntilNext = scheduled.getTime() - now.getTime();
      logToFile(`[DigestService] Next ${time} digest in ${Math.round(msUntilNext / 1000 / 60)} minutes`);

      const timer = setTimeout(async () => {
        await this.sendDigest(time);
        scheduleNext(); // Schedule next occurrence
      }, msUntilNext);

      this.timers.push(timer);
    };

    scheduleNext();
  }

  /**
   * Send the digest for a specific time slot
   */
  private async sendDigest(timeSlot: string) {
    logToFile(`[DigestService] ========== Generating ${timeSlot} Digest ==========`);

    try {
      // Check if we've already sent this digest recently (within last hour)
      const state = this.getDigestState();
      const lastSent = state.lastSent[timeSlot] || 0;
      const hourAgo = Date.now() - (60 * 60 * 1000);

      if (lastSent > hourAgo) {
        logToFile(`[DigestService] Already sent ${timeSlot} digest recently, skipping`);
        return;
      }

      // Get actionable items
      const items = await this.getActionableItems();

      if (items.length === 0) {
        logToFile('[DigestService] No actionable items found');
        return;
      }

      // Send Slack DM with items
      await this.sendSlackDigest(items, timeSlot);

      // Update state
      state.lastSent[timeSlot] = Date.now();
      this.saveDigestState(state);

      logToFile(`[DigestService] ========== ${timeSlot} Digest Sent ==========`);
    } catch (error) {
      logToFile(`[DigestService] Error sending digest: ${error}`);
    }
  }

  /**
   * Get actionable items from monitored channels
   */
  private async getActionableItems(): Promise<ActionableItem[]> {
    const userSettings = store.get('userSettings', {}) as any;
    const monitoredChannels = userSettings.slackChannels || [];
    const vipContacts = userSettings.slackVipContacts || [];
    const userEmail = userSettings.email;

    if (monitoredChannels.length === 0) {
      logToFile('[DigestService] No monitored channels configured');
      return [];
    }

    logToFile(`[DigestService] Scanning ${monitoredChannels.length} channels for actionable items`);

    const messages = await this.fetchRecentMessages(monitoredChannels);
    logToFile(`[DigestService] Found ${messages.length} recent messages`);

    // Filter out already suggested or completed messages
    const state = this.getDigestState();
    const newMessages = messages.filter(msg => {
      // Skip if already suggested in last 7 days
      const suggestedTime = state.suggestedMessages[msg.id];
      if (suggestedTime && Date.now() - suggestedTime < 7 * 24 * 60 * 60 * 1000) {
        return false;
      }

      // Skip if task was already created from this message
      if (state.createdTasks[msg.id]) {
        return false;
      }

      return true;
    });

    logToFile(`[DigestService] ${newMessages.length} new messages after deduplication`);

    // Use AI to analyze and score messages
    const actionableItems: ActionableItem[] = [];

    for (const message of newMessages) {
      try {
        const item = await this.analyzeMessage(message, vipContacts, userEmail);
        if (item) {
          actionableItems.push(item);

          // Mark as suggested
          state.suggestedMessages[message.id] = Date.now();
        }
      } catch (error) {
        logToFile(`[DigestService] Error analyzing message ${message.id}: ${error}`);
      }
    }

    // Save updated state
    this.saveDigestState(state);

    // Sort by priority and return top 5
    const sorted = actionableItems.sort((a, b) => b.priority - a.priority);
    const top5 = sorted.slice(0, 5);

    logToFile(`[DigestService] Found ${actionableItems.length} actionable items, returning top 5`);

    return top5;
  }

  /**
   * Fetch recent messages from Slack channels
   */
  private async fetchRecentMessages(channelIds: string[]): Promise<SlackMessage[]> {
    if (!this.slackToken) return [];

    const messages: SlackMessage[] = [];
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);

    for (const channelId of channelIds) {
      try {
        const response = await fetch(
          `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${oneDayAgo}&limit=50`,
          {
            headers: {
              'Authorization': `Bearer ${this.slackToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();

        if (data.ok && data.messages) {
          for (const msg of data.messages) {
            messages.push({
              id: msg.ts,
              channel: channelId,
              channelName: data.channel?.name || channelId,
              user: msg.user || 'unknown',
              userName: msg.user_profile?.display_name || msg.user_profile?.real_name || msg.user || 'Unknown',
              text: msg.text || '',
              ts: msg.ts,
              threadTs: msg.thread_ts,
              permalink: msg.permalink,
            });
          }
        }
      } catch (error) {
        logToFile(`[DigestService] Error fetching messages from ${channelId}: ${error}`);
      }
    }

    return messages;
  }

  /**
   * Analyze a message with AI to determine if it's actionable
   */
  private async analyzeMessage(
    message: SlackMessage,
    vipContacts: string[],
    _userEmail?: string
  ): Promise<ActionableItem | null> {
    if (!this.openai) return null;

    // Check if message is too old (more than 24 hours)
    const messageTime = parseFloat(message.ts) * 1000;
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (messageTime < dayAgo) return null;

    try {
      const prompt = `Analyze this Slack message and determine if it requires action from the user.

Message: "${message.text}"
From: ${message.userName}
Channel: #${message.channelName}

Determine:
1. Is this an actionable item? (question, request, decision needed, bug report, feature request, etc.)
2. What specific action should the user take?
3. Is it urgent or can it wait?
4. Brief summary (1 sentence)

Respond in JSON format:
{
  "isActionable": boolean,
  "summary": "one sentence summary",
  "suggestedAction": "what the user should do",
  "urgency": "high" | "medium" | "low",
  "reason": "why this needs attention"
}

If not actionable, set isActionable to false.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an assistant that identifies actionable items in Slack messages.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');

      if (!analysis.isActionable) {
        return null;
      }

      // Calculate priority score (0-100)
      let priority = 50; // Base score

      // VIP contact bonus
      if (vipContacts.includes(message.user)) {
        priority += 30;
      }

      // Urgency bonus
      if (analysis.urgency === 'high') {
        priority += 15;
      } else if (analysis.urgency === 'medium') {
        priority += 5;
      }

      // Recency bonus (newer = higher priority)
      const hoursSinceMessage = (Date.now() - messageTime) / (1000 * 60 * 60);
      if (hoursSinceMessage < 2) {
        priority += 10;
      } else if (hoursSinceMessage < 6) {
        priority += 5;
      }

      priority = Math.min(100, priority); // Cap at 100

      const reasons: string[] = [];
      if (vipContacts.includes(message.user)) {
        reasons.push('From VIP contact');
      }
      if (analysis.urgency === 'high') {
        reasons.push('High urgency');
      }
      if (hoursSinceMessage < 2) {
        reasons.push('Very recent');
      }
      reasons.push(analysis.reason);

      return {
        id: `${message.channel}_${message.ts}`,
        messageId: message.id,
        channel: message.channel,
        channelName: message.channelName,
        user: message.user,
        userName: message.userName,
        text: message.text,
        summary: analysis.summary,
        suggestedAction: analysis.suggestedAction,
        priority,
        permalink: message.permalink,
        threadTs: message.threadTs,
        timestamp: messageTime,
        reasons,
      };
    } catch (error) {
      logToFile(`[DigestService] Error analyzing message: ${error}`);
      return null;
    }
  }

  /**
   * Send digest as Slack DM
   */
  private async sendSlackDigest(items: ActionableItem[], timeSlot: string) {
    if (!this.slackToken) return;

    const userSettings = store.get('userSettings', {}) as any;
    const userEmail = userSettings.email;

    if (!userEmail) {
      logToFile('[DigestService] User email not set, cannot send DM');
      return;
    }

    try {
      // Get user's Slack ID from email
      const userResponse = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(userEmail)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.slackToken}`,
          },
        }
      );

      const userData = await userResponse.json();

      if (!userData.ok || !userData.user) {
        logToFile(`[DigestService] Could not find Slack user for email: ${userEmail}`);
        return;
      }

      const userId = userData.user.id;

      // Build message blocks
      const blocks = this.buildDigestBlocks(items, timeSlot);

      // Send DM
      const messageResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.slackToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: userId,
          blocks,
          text: `📬 ${timeSlot} Inbox: ${items.length} things you might have missed`,
        }),
      });

      const messageData = await messageResponse.json();

      if (messageData.ok) {
        logToFile(`[DigestService] Sent digest to ${userEmail}`);
      } else {
        logToFile(`[DigestService] Failed to send digest: ${messageData.error}`);
      }
    } catch (error) {
      logToFile(`[DigestService] Error sending Slack DM: ${error}`);
    }
  }

  /**
   * Build Slack message blocks for digest
   */
  private buildDigestBlocks(items: ActionableItem[], timeSlot: string): any[] {
    const timeEmojis: { [key: string]: string } = {
      '09:00': '🌅',
      '12:00': '☀️',
      '17:00': '🌆',
    };

    const emoji = timeEmojis[timeSlot] || '📬';

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Things You Might Have Missed`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Here are *${items.length} actionable items* from your monitored channels:`,
        },
      },
      {
        type: 'divider',
      },
    ];

    items.forEach((item, index) => {
      // Item block
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${index + 1}. ${item.summary}*\n` +
                `From *${item.userName}* in <#${item.channel}>\n` +
                `_${item.suggestedAction}_\n` +
                `${item.reasons.map(r => `• ${r}`).join('\n')}`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📝 Create Task',
          },
          action_id: `create_task_${item.id}`,
          value: JSON.stringify({
            messageId: item.messageId,
            summary: item.summary,
            channel: item.channel,
            permalink: item.permalink,
          }),
        },
      });

      if (item.permalink) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `<${item.permalink}|View message>`,
            },
          ],
        });
      }

      if (index < items.length - 1) {
        blocks.push({
          type: 'divider',
        });
      }
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💡 Tasks created from these items won\'t appear in future digests',
        },
      ],
    });

    return blocks;
  }

  /**
   * Mark a message as having a task created
   */
  markTaskCreated(messageId: string, taskId: string) {
    const state = this.getDigestState();
    state.createdTasks[messageId] = taskId;
    this.saveDigestState(state);
    logToFile(`[DigestService] Marked message ${messageId} as having task ${taskId}`);
  }

  /**
   * Get digest state
   */
  private getDigestState(): DigestState {
    return store.get('digestState', {
      lastSent: {},
      suggestedMessages: {},
      createdTasks: {},
    }) as DigestState;
  }

  /**
   * Save digest state
   */
  private saveDigestState(state: DigestState) {
    store.set('digestState', state);
  }
}
