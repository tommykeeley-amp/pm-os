import { WebClient } from '@slack/web-api';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const logFilePath = path.join(os.homedir(), 'pm-os-slack-debug.log');
function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(logFilePath, logMessage + '\n');
  console.log(message);
}

interface SlackMessage {
  id: string;
  type: 'mention' | 'dm' | 'thread' | 'saved' | 'channel';
  text: string;
  user: string;
  userName?: string;
  channel: string;
  channelName?: string;
  timestamp: string;
  permalink?: string;
  threadTs?: string;
}

interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  botToken?: string;
  teamUrl?: string;
}

export class SlackService {
  private client: WebClient | null = null;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  setTokens(tokens: TokenData) {
    this.client = new WebClient(tokens.accessToken);
  }

  async exchangeCodeForTokens(code: string): Promise<TokenData> {
    const tempClient = new WebClient();

    const response = await tempClient.oauth.v2.access({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });

    if (!response.ok || !response.access_token) {
      throw new Error('Failed to exchange code for tokens');
    }

    const result: TokenData = {
      accessToken: response.access_token,
    };

    // Capture bot token if present
    if (response.bot_user_id && response.access_token) {
      result.botToken = response.access_token;
    }

    // Capture team URL
    if (response.team && typeof response.team === 'object' && 'url' in response.team) {
      result.teamUrl = (response.team as any).url;
    }

    return result;
  }

  async getMentions(limit: number = 20): Promise<SlackMessage[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      // Get user ID
      const authTest = await this.client.auth.test();
      const userId = authTest.user_id;

      // Search for mentions (returns most recent mentions, Slack doesn't filter by unread)
      const response = await this.client.search.messages({
        query: `<@${userId}>`,
        sort: 'timestamp',
        sort_dir: 'desc',
        count: limit,
      });

      if (!response.ok || !response.messages?.matches) {
        return [];
      }

      // Return recent mentions (Slack search doesn't provide reliable unread filtering)
      // User can mark as read in Slack if they don't want to see them
      return this.parseMessages(response.messages.matches, 'mention');
    } catch (error) {
      console.error('Failed to get Slack mentions:', error);
      return [];
    }
  }

  async getDirectMessages(limit: number = 20): Promise<SlackMessage[]> {
    logToFile('[SlackService.getDirectMessages] ========== START ==========');
    logToFile(`[SlackService.getDirectMessages] Limit: ${limit}`);

    if (!this.client) throw new Error('Slack client not initialized');

    // Add overall timeout to prevent hanging
    const timeoutPromise = new Promise<SlackMessage[]>((resolve) => {
      setTimeout(() => {
        logToFile('[SlackService.getDirectMessages] Overall timeout reached, returning empty array');
        resolve([]);
      }, 90000); // 90 second timeout for 100 conversations
    });

    const fetchPromise = this._fetchDirectMessages(limit);

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  private async _fetchDirectMessages(limit: number): Promise<SlackMessage[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      // Get current user ID
      logToFile('[SlackService._fetchDirectMessages] Getting current user ID...');
      const authTest = await this.client.auth.test();
      const currentUserId = authTest.user_id;
      logToFile(`[SlackService._fetchDirectMessages] Current user ID: ${currentUserId}`);

      // DEBUG: Search for Marvin Liu user
      try {
        logToFile('[SlackService._fetchDirectMessages] DEBUG: Searching for Marvin Liu...');
        const usersResult = await this.client.users.list({ limit: 1000 });
        if (usersResult.ok && usersResult.members) {
          const marvinUser = usersResult.members.find(u =>
            (u.real_name && u.real_name.toLowerCase().includes('marvin liu')) ||
            (u.profile?.display_name && u.profile.display_name.toLowerCase().includes('marvin liu')) ||
            (u.name && u.name.toLowerCase().includes('marvin'))
          );
          if (marvinUser) {
            logToFile(`[SlackService._fetchDirectMessages] DEBUG: Found Marvin Liu - ID: ${marvinUser.id}, Real Name: ${marvinUser.real_name}, Display: ${marvinUser.profile?.display_name}`);

            // Try to open/find DM with this user
            const dmResult = await this.client.conversations.open({
              users: marvinUser.id!
            });
            if (dmResult.ok && dmResult.channel) {
              logToFile(`[SlackService._fetchDirectMessages] DEBUG: Marvin DM Channel ID: ${dmResult.channel.id}`);

              // Check if this channel has unread messages
              const dmInfo = await this.client.conversations.info({
                channel: dmResult.channel.id!
              });
              if (dmInfo.ok) {
                logToFile(`[SlackService._fetchDirectMessages] DEBUG: Marvin DM Info: ${JSON.stringify({
                  unread_count: (dmInfo.channel as any).unread_count_display,
                  last_read: (dmInfo.channel as any).last_read,
                  latest_ts: (dmInfo.channel as any).latest?.ts,
                  is_open: (dmInfo.channel as any).is_open,
                  is_im: (dmInfo.channel as any).is_im
                })}`);
              }
            }
          } else {
            logToFile('[SlackService._fetchDirectMessages] DEBUG: Marvin Liu user not found');
          }
        }
      } catch (err) {
        logToFile(`[SlackService._fetchDirectMessages] DEBUG: Error searching for Marvin: ${err}`);
      }

      // Get DM conversations with unread messages
      // Check first 100 conversations to catch more unread DMs
      // Don't exclude archived - some active DMs might be marked archived
      logToFile('[SlackService._fetchDirectMessages] Fetching IM conversations...');
      const conversations = await this.client.conversations.list({
        types: 'im',
        limit: 100,
        exclude_archived: false,
      });

      logToFile(`[SlackService._fetchDirectMessages] Conversations result: ${JSON.stringify({
        ok: conversations.ok,
        channelCount: conversations.channels?.length || 0
      })}`);

      if (!conversations.ok || !conversations.channels) {
        logToFile('[SlackService._fetchDirectMessages] No conversations found, returning empty array');
        return [];
      }

      const messages: SlackMessage[] = [];
      let totalUnreadConversations = 0;

      // Check conversations sequentially to avoid hanging
      logToFile('[SlackService._fetchDirectMessages] Checking conversations for unread messages...');
      for (const channel of conversations.channels) {
        const channelData = channel as any;

        // Get conversation info to check for unread messages
        try {
          const convInfo = await this.client.conversations.info({
            channel: channel.id!,
          });

          const unreadCount = convInfo.ok && convInfo.channel
            ? (convInfo.channel as any).unread_count_display || 0
            : 0;

          // Extract timestamp fields for reliable unread detection
          const lastRead = (convInfo.channel as any).last_read;
          const latestMessageTs = (convInfo.channel as any).latest?.ts;

          // Get user name for logging
          let debugUserName = 'Unknown';
          if (channelData.user) {
            try {
              const userInfo = await this.getUserInfo(channelData.user);
              debugUserName = userInfo?.realName || userInfo?.name || channelData.user;
            } catch (err) {
              debugUserName = channelData.user;
            }
          }

          logToFile(`[SlackService._fetchDirectMessages] Checking channel: ${JSON.stringify({
            id: channel.id,
            unread_count_display: unreadCount,
            user: channelData.user,
            userName: debugUserName,
            lastRead,
            latestMessageTs
          })}`);

          // Unread detection: Check explicit count first, skip expensive checks if clearly read
          let hasUnreadMessages = false;
          let detectionMethod = '';

          // Signal 1: Explicit unread count (most reliable if present)
          if (unreadCount && unreadCount > 0) {
            hasUnreadMessages = true;
            detectionMethod = 'explicit count';
          }
          // Signal 2: Timestamp comparison (compare last_read with latest message)
          // Skip if lastRead equals latestMessageTs (clearly read)
          else if (lastRead && latestMessageTs && lastRead !== '0000000000.000000') {
            if (parseFloat(latestMessageTs) > parseFloat(lastRead)) {
              hasUnreadMessages = true;
              detectionMethod = 'timestamp comparison';
            }
          }

          if (!hasUnreadMessages) {
            logToFile(`[SlackService._fetchDirectMessages] No unread messages, skipping`);
            continue;
          }

          logToFile(`[SlackService._fetchDirectMessages] Including DM via: ${detectionMethod}`);

          totalUnreadConversations++;
          console.log(`[SlackService._fetchDirectMessages] Found DM with ${unreadCount} unread messages`);

          // Get the other user's ID from the DM
          const otherUserId = channelData.user;

          // Get user info for display name
          let userName = 'Unknown User';
          if (otherUserId) {
            const userInfo = await this.getUserInfo(otherUserId);
            userName = userInfo?.realName || userInfo?.name || otherUserId;
            logToFile(`[SlackService._fetchDirectMessages] User name: ${userName}`);
          }

          // Get recent messages from this DM
          // Fetch enough messages to ensure we get at least one from the other person
          const history = await this.client.conversations.history({
            channel: channel.id!,
            limit: 50, // Fetch up to 50 messages to find messages from the other person
          });

          if (history.ok && history.messages) {
            logToFile(`[SlackService._fetchDirectMessages] Got ${history.messages.length} messages from history`);

            let allMessages = [...history.messages];

            // Check if latest message is in a thread (threaded reply not in main history)
            // If latestMessageTs is newer than all history messages, it's likely a threaded reply
            const newestHistoryTs = history.messages[0]?.ts;
            if (latestMessageTs && newestHistoryTs && parseFloat(latestMessageTs) > parseFloat(newestHistoryTs)) {
              logToFile(`[SlackService._fetchDirectMessages] Latest message (${latestMessageTs}) is newer than history (${newestHistoryTs}), checking for threads...`);

              // Find parent messages with threads and fetch their replies
              for (const msg of history.messages.slice(0, 5)) { // Check first 5 messages for threads
                if (msg.thread_ts && msg.thread_ts === msg.ts) { // This is a thread parent
                  try {
                    const threadReplies = await this.client.conversations.replies({
                      channel: channel.id!,
                      ts: msg.thread_ts,
                      limit: 20
                    });
                    if (threadReplies.ok && threadReplies.messages) {
                      logToFile(`[SlackService._fetchDirectMessages] Found ${threadReplies.messages.length} messages in thread ${msg.thread_ts}`);
                      // Add all thread replies except the parent (which is already in history)
                      const replies = threadReplies.messages.slice(1);
                      allMessages.push(...replies);
                    }
                  } catch (err) {
                    logToFile(`[SlackService._fetchDirectMessages] Error fetching thread ${msg.thread_ts}: ${err}`);
                  }
                }
              }
            }

            // Sort all messages by timestamp (newest first)
            allMessages.sort((a, b) => parseFloat(b.ts || '0') - parseFloat(a.ts || '0'));
            logToFile(`[SlackService._fetchDirectMessages] Total messages after thread fetch: ${allMessages.length}`);

            // Get all messages from other users (not from current user)
            const allOtherUserMessages = allMessages.filter(msg =>
              msg.user && msg.user !== currentUserId
            );

            // Filter to truly unread messages by timestamp
            let unreadMessages = allOtherUserMessages.filter(msg => {
              if (!lastRead || lastRead === '0000000000.000000' || !msg.ts) return true;
              return parseFloat(msg.ts) > parseFloat(lastRead);
            });

            // If no unread messages, but conversation is active, show the most recent message anyway
            // This ensures users can see their recent DM conversations even if marked as "read"
            if (unreadMessages.length === 0 && allOtherUserMessages.length > 0) {
              unreadMessages = allOtherUserMessages.slice(0, 1);
              logToFile('[SlackService._fetchDirectMessages] No unread messages, showing most recent message from conversation');
            }

            // Limit to reasonable count
            unreadMessages = unreadMessages.slice(0, Math.max(unreadCount, 1));

            logToFile(`[SlackService._fetchDirectMessages] Filtered to ${unreadMessages.length} messages from others (method: ${detectionMethod})`);

            for (const msg of unreadMessages) {
              messages.push({
                id: `${channel.id}_${msg.ts}`,
                type: 'dm',
                text: msg.text || '',
                user: otherUserId || '',
                userName: userName,
                channel: channel.id!,
                channelName: `DM with ${userName}`,
                timestamp: msg.ts || '',
                permalink: await this.getPermalink(channel.id!, msg.ts!),
                threadTs: msg.thread_ts,
              });
            }
          }

          // Stop if we've reached the limit
          if (messages.length >= limit) {
            logToFile('[SlackService._fetchDirectMessages] Reached message limit, stopping');
            break;
          }
        } catch (error) {
          logToFile(`[SlackService._fetchDirectMessages] Error checking channel ${channel.id}: ${error}`);
          continue;
        }
      }

      logToFile(`[SlackService._fetchDirectMessages] Summary: ${JSON.stringify({
        totalConversations: conversations.channels.length,
        unreadConversations: totalUnreadConversations,
        totalMessages: messages.length
      })}`);
      logToFile('[SlackService._fetchDirectMessages] ========== COMPLETE ==========');
      return messages.slice(0, limit);
    } catch (error) {
      logToFile(`[SlackService._fetchDirectMessages] ERROR: ${JSON.stringify({
        error: error,
        message: (error as any)?.message,
        stack: (error as any)?.stack
      })}`);
      return [];
    }
  }

  private async getPermalink(channel: string, ts: string): Promise<string> {
    if (!this.client) return '';

    try {
      const response = await this.client.chat.getPermalink({
        channel,
        message_ts: ts,
      });

      return response.ok && response.permalink ? response.permalink : '';
    } catch (error) {
      console.error('Failed to get permalink:', error);
      return '';
    }
  }

  async getUnreadThreads(limit: number = 20): Promise<SlackMessage[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const conversations = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 50,
      });

      if (!conversations.ok || !conversations.channels) {
        return [];
      }

      const messages: SlackMessage[] = [];

      for (const channel of conversations.channels.slice(0, 10)) {
        if (messages.length >= limit) break;

        try {
          const history = await this.client.conversations.history({
            channel: channel.id!,
            limit: 10,
          });

          if (history.ok && history.messages) {
            // Filter for threads with replies (simplified - not checking read status for speed)
            const threadMessages = history.messages.filter(
              msg => msg.thread_ts && msg.reply_count && msg.reply_count > 0
            );

            const parsedMessages = this.parseMessages(
              threadMessages.map(msg => ({
                ...msg,
                channel: { id: channel.id, name: channel.name },
              })),
              'thread'
            );
            messages.push(...parsedMessages);
          }
        } catch (err) {
          // Skip this channel if we can't check it
          continue;
        }
      }

      return messages.slice(0, limit);
    } catch (error) {
      console.error('Failed to get Slack threads:', error);
      return [];
    }
  }

  async getSavedItems(limit: number = 20): Promise<SlackMessage[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const response = await this.client.stars.list({
        limit,
      });

      if (!response.ok || !response.items) {
        return [];
      }

      const messages = response.items
        .filter(item => item.type === 'message')
        .map(item => item.message!);

      return this.parseMessages(messages, 'saved');
    } catch (error) {
      console.error('Failed to get Slack saved items:', error);
      return [];
    }
  }

  async getImportantMessages(): Promise<SlackMessage[]> {
    // Combine mentions, DMs, and saved items
    const [mentions, dms, saved] = await Promise.all([
      this.getMentions(10),
      this.getDirectMessages(10),
      this.getSavedItems(10),
    ]);

    // Combine and deduplicate
    const allMessages = [...mentions, ...dms, ...saved];
    const uniqueMessages = Array.from(
      new Map(allMessages.map(msg => [msg.id, msg])).values()
    );

    // Sort by timestamp (most recent first)
    return uniqueMessages
      .sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp))
      .slice(0, 20);
  }

  async getUnreadMessages(channelIds: string[] = []): Promise<SlackMessage[]> {
    console.log('[SlackService.getUnreadMessages] ========== START ==========');
    console.log('[SlackService.getUnreadMessages] Client initialized:', !!this.client);
    console.log('[SlackService.getUnreadMessages] Channel IDs to monitor:', channelIds);

    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const messages: SlackMessage[] = [];

      // Get DMs (always included)
      console.log('[SlackService.getUnreadMessages] Fetching direct messages...');
      const dmMessages = await this.getDirectMessages(20);
      console.log('[SlackService.getUnreadMessages] DM messages received:', {
        count: dmMessages.length,
        messages: dmMessages
      });
      messages.push(...dmMessages);

      // Get messages from specified channels
      if (channelIds.length > 0) {
        console.log('[SlackService.getUnreadMessages] Fetching from specified channels...');
        for (const channelId of channelIds) {
          try {
            // Get channel info
            const channelInfo = await this.client.conversations.info({
              channel: channelId,
            });

            const channelName = channelInfo.channel?.name || 'Unknown';
            console.log(`[SlackService.getUnreadMessages] Channel ${channelId} (${channelName})`);

            // Get unread messages from this channel
            const history = await this.client.conversations.history({
              channel: channelId,
              limit: 10,
            });

            if (history.ok && history.messages) {
              console.log(`[SlackService.getUnreadMessages] Channel ${channelName} has ${history.messages.length} recent messages`);
              const parsedMessages = history.messages.map(msg => ({
                id: `${channelId}_${msg.ts}`,
                type: 'channel' as const,
                text: msg.text || '',
                user: msg.user || '',
                userName: msg.username,
                channel: channelId,
                channelName,
                timestamp: msg.ts || '',
                permalink: '',
                threadTs: msg.thread_ts,
              }));

              messages.push(...parsedMessages);
            }
          } catch (error) {
            console.error(`[SlackService.getUnreadMessages] Failed to get messages from channel ${channelId}:`, error);
          }
        }
      } else {
        console.log('[SlackService.getUnreadMessages] No channels specified, skipping channel messages');
      }

      // Deduplicate and sort
      const uniqueMessages = Array.from(
        new Map(messages.map(msg => [msg.id, msg])).values()
      );

      const sortedMessages = uniqueMessages
        .sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp))
        .slice(0, 50);

      console.log('[SlackService.getUnreadMessages] Final result:', {
        totalMessages: messages.length,
        uniqueMessages: uniqueMessages.length,
        finalCount: sortedMessages.length,
        messages: sortedMessages
      });
      console.log('[SlackService.getUnreadMessages] ========== COMPLETE ==========');
      return sortedMessages;
    } catch (error) {
      console.error('[SlackService.getUnreadMessages] ERROR:', {
        error: error,
        message: (error as any)?.message,
        stack: (error as any)?.stack
      });
      return [];
    }
  }

  async getChannels(): Promise<{ id: string; name: string }[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const response = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 200,
        exclude_archived: true,
      });

      if (!response.ok || !response.channels) {
        return [];
      }

      // Filter to only channels the user is a member of
      const memberChannels = response.channels.filter(channel =>
        (channel as any).is_member === true
      );

      return memberChannels.map(channel => ({
        id: channel.id!,
        name: channel.name || 'Unknown',
      }));
    } catch (error) {
      console.error('Failed to get Slack channels:', error);
      return [];
    }
  }

  private parseMessages(messages: any[], type: SlackMessage['type']): SlackMessage[] {
    return messages.map(msg => {
      const channelId = msg.channel?.id || msg.channel || '';
      let channelName = msg.channel?.name;

      // If channelName is a user ID (starts with U or D) or missing, use username instead
      if (!channelName || channelName.startsWith('U') || channelName.startsWith('D')) {
        channelName = msg.username || channelName;
      }

      return {
        id: `${channelId}_${msg.ts}`,
        type,
        text: msg.text || '',
        user: msg.user || '',
        userName: msg.username,
        channel: channelId,
        channelName: channelName,
        timestamp: msg.ts,
        permalink: msg.permalink,
        threadTs: msg.thread_ts,
      };
    });
  }

  async getUserInfo(userId: string): Promise<{ name: string; realName: string } | null> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const response = await this.client.users.info({ user: userId });

      if (!response.ok || !response.user) {
        return null;
      }

      return {
        name: response.user.name || '',
        realName: response.user.real_name || '',
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  /**
   * Fetch all replies in a Slack thread
   * @param channelId - The channel ID where the thread exists
   * @param threadTs - The thread timestamp (parent message timestamp)
   * @returns Array of thread messages with user info
   */
  async getThreadReplies(channelId: string, threadTs: string): Promise<Array<{text: string; user: string; userName: string; timestamp: string}>> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      console.log('[SlackService] Fetching thread replies for channel:', channelId, 'thread:', threadTs);

      // Fetch thread conversation
      const response = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });

      if (!response.ok || !response.messages) {
        console.error('[SlackService] Failed to fetch thread replies:', response);
        return [];
      }

      // Parse messages and fetch user info
      const replies = [];
      for (const msg of response.messages) {
        if (!msg.text) continue;

        let userName = 'Unknown User';
        if (msg.user) {
          const userInfo = await this.getUserInfo(msg.user);
          userName = userInfo?.realName || userInfo?.name || msg.user;
        }

        replies.push({
          text: msg.text,
          user: msg.user || '',
          userName,
          timestamp: msg.ts || '',
        });
      }

      console.log('[SlackService] Fetched', replies.length, 'thread replies');
      return replies;
    } catch (error) {
      console.error('[SlackService] Failed to get thread replies:', error);
      return [];
    }
  }
}
