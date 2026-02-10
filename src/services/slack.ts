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

      const messages: SlackMessage[] = [];
      const processedChannelIds = new Set<string>();

      // APPROACH 1: Use search API to find recent DM messages
      // This finds DMs regardless of when the conversation was created
      logToFile('[SlackService._fetchDirectMessages] Using search API to find recent DMs...');
      try {
        // Search for messages in DMs (is:dm) that are not from me
        // This catches DMs from old conversations that wouldn't be in conversations.list
        const searchResponse = await this.client.search.messages({
          query: 'is:dm',
          sort: 'timestamp',
          sort_dir: 'desc',
          count: 100, // Get recent DM messages
        });

        if (searchResponse.ok && searchResponse.messages?.matches) {
          logToFile(`[SlackService._fetchDirectMessages] Search found ${searchResponse.messages.matches.length} DM messages`);

          // Group messages by channel to find unique DM conversations
          const channelMessages = new Map<string, any[]>();
          for (const msg of searchResponse.messages.matches) {
            const channelId = msg.channel?.id;
            if (!channelId) continue;

            // Skip messages from current user - we want messages TO us
            if (msg.user === currentUserId) continue;

            if (!channelMessages.has(channelId)) {
              channelMessages.set(channelId, []);
            }
            channelMessages.get(channelId)!.push(msg);
          }

          logToFile(`[SlackService._fetchDirectMessages] Found ${channelMessages.size} unique DM channels from search`);

          // Get channel info for all DM channels in parallel (limit to first 10 for speed)
          const channelIds = Array.from(channelMessages.keys()).slice(0, 10);
          const convInfoPromises = channelIds.map(channelId =>
            this.client!.conversations.info({ channel: channelId })
              .catch(() => null)
          );
          const convInfoResults = await Promise.all(convInfoPromises);

          // Process results
          for (let i = 0; i < channelIds.length; i++) {
            if (messages.length >= limit) break;

            const channelId = channelIds[i];
            const convInfo = convInfoResults[i];
            const channelMsgs = channelMessages.get(channelId)!;

            if (!convInfo || !convInfo.ok || !convInfo.channel) {
              continue;
            }

            const channelData = convInfo.channel as any;
            const unreadCount = channelData.unread_count_display || 0;
            const lastRead = channelData.last_read;
            const latestMessageTs = channelData.latest?.ts;
            const otherUserId = channelData.user;

            // Check if there are unread messages
            let hasUnreadMessages = false;
            if (unreadCount > 0) {
              hasUnreadMessages = true;
            } else if (lastRead && latestMessageTs && lastRead !== '0000000000.000000') {
              if (parseFloat(latestMessageTs) > parseFloat(lastRead)) {
                hasUnreadMessages = true;
              }
            }

            if (!hasUnreadMessages) {
              logToFile(`[SlackService._fetchDirectMessages] Channel ${channelId} has no unread messages, skipping`);
              continue;
            }

            // Get user info
            let userName = 'Unknown User';
            if (otherUserId) {
              const userInfo = await this.getUserInfo(otherUserId);
              userName = userInfo?.realName || userInfo?.name || otherUserId;
            }

            logToFile(`[SlackService._fetchDirectMessages] [SEARCH] Found unread DM from ${userName} (channel: ${channelId})`);

            // Get the most recent unread message from search results
            const recentMsg = channelMsgs[0];
            if (recentMsg) {
              // Verify it's actually unread
              const msgTs = recentMsg.ts;
              const isUnread = !lastRead || lastRead === '0000000000.000000' || parseFloat(msgTs) > parseFloat(lastRead);

              if (isUnread) {
                messages.push({
                  id: `${channelId}_${msgTs}`,
                  type: 'dm',
                  text: recentMsg.text || '',
                  user: otherUserId || recentMsg.user || '',
                  userName: userName,
                  channel: channelId,
                  channelName: `DM with ${userName}`,
                  timestamp: msgTs || '',
                  permalink: recentMsg.permalink || '',
                  threadTs: recentMsg.thread_ts,
                });
                processedChannelIds.add(channelId);
              }
            }
          }
        }
      } catch (searchError) {
        logToFile(`[SlackService._fetchDirectMessages] Search API error: ${searchError}`);
        // Continue with fallback approach
      }

      logToFile(`[SlackService._fetchDirectMessages] After search: ${messages.length} messages found`);

      // If search found enough messages, skip the slower conversations.list fallback
      if (messages.length >= limit) {
        logToFile(`[SlackService._fetchDirectMessages] Search found enough messages, skipping conversations.list`);
        logToFile(`[SlackService._fetchDirectMessages] Final summary: ${JSON.stringify({
          totalMessages: messages.length,
          processedChannels: processedChannelIds.size
        })}`);
        logToFile('[SlackService._fetchDirectMessages] ========== COMPLETE ==========');
        return messages.slice(0, limit);
      }

      // APPROACH 2: Fallback to conversations.list for any DMs not found via search
      // This catches DMs that might not appear in search results
      // Note: We're more conservative here - only use explicit unread_count, not timestamp comparison
      // because timestamp comparison can pick up thread replies that don't show as unread in Slack UI
      logToFile('[SlackService._fetchDirectMessages] Checking conversations.list for additional DMs...');
      const conversations = await this.client.conversations.list({
        types: 'im',
        limit: 50, // Reduced from 100 to improve performance
        exclude_archived: true, // Skip archived to speed up
      });

      if (conversations.ok && conversations.channels) {
        logToFile(`[SlackService._fetchDirectMessages] conversations.list returned ${conversations.channels.length} channels`);

        for (const channel of conversations.channels) {
          if (messages.length >= limit) break;
          if (processedChannelIds.has(channel.id!)) {
            continue; // Already processed via search
          }

          const channelData = channel as any;

          try {
            const convInfo = await this.client.conversations.info({
              channel: channel.id!,
            });

            const unreadCount = convInfo.ok && convInfo.channel
              ? (convInfo.channel as any).unread_count_display || 0
              : 0;

            const lastRead = (convInfo.channel as any).last_read;
            const latestMessage = (convInfo.channel as any).latest;

            // STRICT unread detection for conversations.list fallback:
            // 1. Must have explicit unread_count > 0
            // 2. The latest message must NOT be in a thread (thread replies don't show badges in Slack UI)
            // 3. The latest message must be from the other user (not from us)
            const isLatestInThread = latestMessage?.thread_ts && latestMessage.thread_ts !== latestMessage.ts;
            const isLatestFromOtherUser = latestMessage?.user && latestMessage.user !== currentUserId;

            // Skip if: no explicit unread count, or latest is a thread reply, or latest is from us
            if (unreadCount <= 0 || isLatestInThread || !isLatestFromOtherUser) {
              continue;
            }

            const otherUserId = channelData.user;
            let userName = 'Unknown User';
            if (otherUserId) {
              const userInfo = await this.getUserInfo(otherUserId);
              userName = userInfo?.realName || userInfo?.name || otherUserId;
            }

            logToFile(`[SlackService._fetchDirectMessages] [CONV.LIST] Found unread DM from ${userName} (unread_count: ${unreadCount})`);

            // Get recent messages from this DM
            const history = await this.client.conversations.history({
              channel: channel.id!,
              limit: 10,
            });

            if (history.ok && history.messages) {
              // Get the most recent message from the other user that is unread
              const unreadMessages = history.messages.filter(msg => {
                if (msg.user === currentUserId) return false;
                // Skip thread replies - they don't show as DM unreads
                if (msg.thread_ts && msg.thread_ts !== msg.ts) return false;
                if (!lastRead || lastRead === '0000000000.000000' || !msg.ts) return true;
                return parseFloat(msg.ts) > parseFloat(lastRead);
              });

              if (unreadMessages.length > 0) {
                const msg = unreadMessages[0];
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
                processedChannelIds.add(channel.id!);
              }
            }
          } catch (error) {
            logToFile(`[SlackService._fetchDirectMessages] Error checking channel ${channel.id}: ${error}`);
            continue;
          }
        }
      }

      logToFile(`[SlackService._fetchDirectMessages] Final summary: ${JSON.stringify({
        totalMessages: messages.length,
        processedChannels: processedChannelIds.size
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
      const allChannels: any[] = [];
      let cursor: string | undefined = undefined;

      // Paginate through all channels
      do {
        const response = await this.client.conversations.list({
          types: 'public_channel,private_channel',
          limit: 1000,
          exclude_archived: true,
          cursor,
        });

        if (!response.ok || !response.channels) {
          break;
        }

        allChannels.push(...response.channels);
        cursor = response.response_metadata?.next_cursor;
      } while (cursor);

      // Filter to only channels the user is a member of
      const memberChannels = allChannels.filter(channel =>
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

  async getUsers(): Promise<{ id: string; name: string; realName?: string; avatar?: string }[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const allUsers: any[] = [];
      let cursor: string | undefined = undefined;

      // Paginate through all users
      do {
        const response = await this.client.users.list({
          limit: 1000,
          cursor,
        });

        if (!response.ok || !response.members) {
          break;
        }

        allUsers.push(...response.members);
        cursor = response.response_metadata?.next_cursor;
      } while (cursor);

      // Filter out bots and deleted users, return only active human users
      const activeUsers = allUsers.filter(user =>
        !user.deleted && !user.is_bot && user.id !== 'USLACKBOT'
      );

      return activeUsers.map(user => ({
        id: user.id!,
        name: user.name || 'Unknown',
        realName: user.real_name || user.profile?.real_name || undefined,
        avatar: user.profile?.image_48 || user.profile?.image_32 || undefined,
      }));
    } catch (error) {
      console.error('Failed to get Slack users:', error);
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
