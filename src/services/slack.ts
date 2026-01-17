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

    return {
      accessToken: response.access_token,
    };
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
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      // Get DM conversations
      const conversations = await this.client.conversations.list({
        types: 'im',
        limit: 50,
      });

      if (!conversations.ok || !conversations.channels) {
        return [];
      }

      const messages: SlackMessage[] = [];

      // Get recent messages from each DM
      for (const channel of conversations.channels.slice(0, 10)) {
        const history = await this.client.conversations.history({
          channel: channel.id!,
          limit: 5,
        });

        if (history.ok && history.messages) {
          const parsedMessages = this.parseMessages(
            history.messages.map(msg => ({
              ...msg,
              channel: { id: channel.id, name: 'DM' },
            })),
            'dm'
          );
          messages.push(...parsedMessages);
        }
      }

      return messages.slice(0, limit);
    } catch (error) {
      console.error('Failed to get Slack DMs:', error);
      return [];
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
    if (!this.client) throw new Error('Slack client not initialized');

    try {
      const messages: SlackMessage[] = [];

      // Get DMs (always included)
      const dmMessages = await this.getDirectMessages(20);
      messages.push(...dmMessages);

      // Get messages from specified channels
      if (channelIds.length > 0) {
        for (const channelId of channelIds) {
          try {
            // Get channel info
            const channelInfo = await this.client.conversations.info({
              channel: channelId,
            });

            const channelName = channelInfo.channel?.name || 'Unknown';

            // Get unread messages from this channel
            const history = await this.client.conversations.history({
              channel: channelId,
              limit: 10,
            });

            if (history.ok && history.messages) {
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
            console.error(`Failed to get messages from channel ${channelId}:`, error);
          }
        }
      }

      // Deduplicate and sort
      const uniqueMessages = Array.from(
        new Map(messages.map(msg => [msg.id, msg])).values()
      );

      return uniqueMessages
        .sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp))
        .slice(0, 50);
    } catch (error) {
      console.error('Failed to get unread Slack messages:', error);
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
