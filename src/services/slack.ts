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

    try {
      // Get current user ID
      console.log('[SlackService.getDirectMessages] Getting current user ID...');
      const authTest = await this.client.auth.test();
      const currentUserId = authTest.user_id;
      console.log('[SlackService.getDirectMessages] Current user ID:', currentUserId);

      // Get DM conversations with unread messages
      // Limit to 30 to avoid slow performance from checking too many conversations
      console.log('[SlackService.getDirectMessages] Fetching IM conversations...');
      const conversations = await this.client.conversations.list({
        types: 'im',
        limit: 30,
        exclude_archived: true,
      });

      console.log('[SlackService.getDirectMessages] Conversations result:', {
        ok: conversations.ok,
        channelCount: conversations.channels?.length || 0
      });

      if (!conversations.ok || !conversations.channels) {
        console.log('[SlackService.getDirectMessages] No conversations found, returning empty array');
        return [];
      }

      const messages: SlackMessage[] = [];
      let totalUnreadConversations = 0;

      // Parallelize conversations.info() calls for better performance
      console.log('[SlackService.getDirectMessages] Fetching conversation info in parallel...');
      const client = this.client; // Store reference for use in Promise.all

      // Helper to add timeout to promises
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
          )
        ]);
      };

      const convInfoPromises = conversations.channels.map(channel =>
        withTimeout(
          client.conversations.info({ channel: channel.id! }),
          5000 // 5 second timeout per request
        )
          .then(convInfo => ({
            channel,
            unreadCount: convInfo.ok && convInfo.channel
              ? (convInfo.channel as any).unread_count_display || 0
              : 0
          }))
          .catch(error => {
            console.log('[SlackService.getDirectMessages] Error getting conversation info for channel', channel.id, ':', error.message);
            return { channel, unreadCount: 0 };
          })
      );

      const convInfoResults = await Promise.all(convInfoPromises);
      console.log('[SlackService.getDirectMessages] Got conversation info for all channels:', convInfoResults.length);

      // Filter for DMs with unread messages
      for (const { channel, unreadCount } of convInfoResults) {
        const channelData = channel as any;

        console.log('[SlackService.getDirectMessages] Checking channel:', {
          id: channel.id,
          unread_count_display: unreadCount,
          user: channelData.user
        });

        // Check if there are unread messages
        if (!unreadCount || unreadCount === 0) {
          continue;
        }

        totalUnreadConversations++;
        console.log(`[SlackService.getDirectMessages] Found DM with ${unreadCount} unread messages`);

        // Get the other user's ID from the DM
        const otherUserId = channelData.user;

        // Get user info for display name
        let userName = 'Unknown User';
        if (otherUserId) {
          const userInfo = await this.getUserInfo(otherUserId);
          userName = userInfo?.realName || userInfo?.name || otherUserId;
          console.log('[SlackService.getDirectMessages] User name:', userName);
        }

        // Get recent unread messages from this DM
        const history = await this.client.conversations.history({
          channel: channel.id!,
          limit: 10,
        });

        if (history.ok && history.messages) {
          console.log(`[SlackService.getDirectMessages] Got ${history.messages.length} messages from history`);

          // Only include messages not sent by current user
          const unreadMessages = history.messages
            .filter(msg => msg.user !== currentUserId)
            .slice(0, unreadCount);

          console.log(`[SlackService.getDirectMessages] Filtered to ${unreadMessages.length} unread messages from others`);

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
          console.log('[SlackService.getDirectMessages] Reached message limit, stopping');
          break;
        }
      }

      console.log('[SlackService.getDirectMessages] Summary:', {
        totalConversations: conversations.channels.length,
        unreadConversations: totalUnreadConversations,
        totalMessages: messages.length
      });
      console.log('[SlackService.getDirectMessages] ========== COMPLETE ==========');
      return messages.slice(0, limit);
    } catch (error) {
      console.error('[SlackService.getDirectMessages] ERROR:', {
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
}
