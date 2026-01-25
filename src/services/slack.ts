import { WebClient } from '@slack/web-api';

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

      // Search for mentions
      const response = await this.client.search.messages({
        query: `<@${userId}>`,
        sort: 'timestamp',
        sort_dir: 'desc',
        count: limit,
      });

      if (!response.ok || !response.messages?.matches) {
        return [];
      }

      return this.parseMessages(response.messages.matches, 'mention');
    } catch (error) {
      console.error('Failed to get Slack mentions:', error);
      return [];
    }
  }

  async getDirectMessages(limit: number = 20): Promise<SlackMessage[]> {
    console.log('[SlackService.getDirectMessages] ========== START ==========');
    console.log('[SlackService.getDirectMessages] Limit:', limit);

    if (!this.client) throw new Error('Slack client not initialized');

    // Add overall timeout to prevent hanging
    const timeoutPromise = new Promise<SlackMessage[]>((resolve) => {
      setTimeout(() => {
        console.log('[SlackService.getDirectMessages] Overall timeout reached, returning empty array');
        resolve([]);
      }, 10000); // 10 second overall timeout
    });

    const fetchPromise = this._fetchDirectMessages(limit);

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  private async _fetchDirectMessages(limit: number): Promise<SlackMessage[]> {
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      // Get current user ID
      console.log('[SlackService._fetchDirectMessages] Getting current user ID...');
      const authTest = await this.client.auth.test();
      const currentUserId = authTest.user_id;
      console.log('[SlackService._fetchDirectMessages] Current user ID:', currentUserId);

      // Get DM conversations with unread messages
      // Only check first 10 to avoid timeouts
      console.log('[SlackService._fetchDirectMessages] Fetching IM conversations...');
      const conversations = await this.client.conversations.list({
        types: 'im',
        limit: 10,
        exclude_archived: true,
      });

      console.log('[SlackService._fetchDirectMessages] Conversations result:', {
        ok: conversations.ok,
        channelCount: conversations.channels?.length || 0
      });

      if (!conversations.ok || !conversations.channels) {
        console.log('[SlackService._fetchDirectMessages] No conversations found, returning empty array');
        return [];
      }

      const messages: SlackMessage[] = [];
      let totalUnreadConversations = 0;

      // Check conversations sequentially to avoid hanging
      console.log('[SlackService._fetchDirectMessages] Checking conversations for unread messages...');
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

          console.log('[SlackService._fetchDirectMessages] Checking channel:', {
            id: channel.id,
            unread_count_display: unreadCount,
            user: channelData.user
          });

          // Check if there are unread messages
          if (!unreadCount || unreadCount === 0) {
            continue;
          }

          totalUnreadConversations++;
          console.log(`[SlackService._fetchDirectMessages] Found DM with ${unreadCount} unread messages`);

          // Get the other user's ID from the DM
          const otherUserId = channelData.user;

          // Get user info for display name
          let userName = 'Unknown User';
          if (otherUserId) {
            const userInfo = await this.getUserInfo(otherUserId);
            userName = userInfo?.realName || userInfo?.name || otherUserId;
            console.log('[SlackService._fetchDirectMessages] User name:', userName);
          }

          // Get recent unread messages from this DM
          // Fetch more messages to ensure we get all unread ones
          const history = await this.client.conversations.history({
            channel: channel.id!,
            limit: Math.max(unreadCount * 2, 20), // Get at least 2x unread count to account for user's own messages
          });

          if (history.ok && history.messages) {
            console.log(`[SlackService._fetchDirectMessages] Got ${history.messages.length} messages from history`);

            // Only include messages not sent by current user, up to unread count
            const unreadMessages = history.messages
              .filter(msg => msg.user !== currentUserId && msg.user) // Filter out user's own messages and ensure user exists
              .slice(0, unreadCount); // Take exactly unreadCount messages

            console.log(`[SlackService._fetchDirectMessages] Filtered to ${unreadMessages.length} unread messages from others (expected: ${unreadCount})`);

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
            console.log('[SlackService._fetchDirectMessages] Reached message limit, stopping');
            break;
          }
        } catch (error) {
          console.log('[SlackService._fetchDirectMessages] Error checking channel', channel.id, ':', error);
          continue;
        }
      }

      console.log('[SlackService._fetchDirectMessages] Summary:', {
        totalConversations: conversations.channels.length,
        unreadConversations: totalUnreadConversations,
        totalMessages: messages.length
      });
      console.log('[SlackService._fetchDirectMessages] ========== COMPLETE ==========');
      return messages.slice(0, limit);
    } catch (error) {
      console.error('[SlackService._fetchDirectMessages] ERROR:', {
        error: error,
        message: (error as any)?.message,
        stack: (error as any)?.stack
      });
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
        const history = await this.client.conversations.history({
          channel: channel.id!,
          limit: 10,
        });

        if (history.ok && history.messages) {
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
      });

      if (!response.ok || !response.channels) {
        return [];
      }

      return response.channels.map(channel => ({
        id: channel.id!,
        name: channel.name || 'Unknown',
      }));
    } catch (error) {
      console.error('Failed to get Slack channels:', error);
      return [];
    }
  }

  private parseMessages(messages: any[], type: SlackMessage['type']): SlackMessage[] {
    return messages.map(msg => ({
      id: `${msg.channel?.id || msg.channel}_${msg.ts}`,
      type,
      text: msg.text || '',
      user: msg.user || '',
      userName: msg.username,
      channel: msg.channel?.id || msg.channel || '',
      channelName: msg.channel?.name,
      timestamp: msg.ts,
      permalink: msg.permalink,
      threadTs: msg.thread_ts,
    }));
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
