import { google } from 'googleapis';

interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  labels: string[];
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class GmailService {
  private oauth2Client: any;
  // @ts-ignore - stored for future use
  private _clientId: string;
  // @ts-ignore - stored for future use
  private _clientSecret: string;
  // @ts-ignore - stored for future use
  private _redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this._clientId = clientId;
    this._clientSecret = clientSecret;
    this._redirectUri = redirectUri;

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
  }

  setTokens(tokens: TokenData) {
    this.oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt,
    });
  }

  async exchangeCodeForTokens(code: string): Promise<TokenData> {
    const { tokens } = await this.oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date,
    };
  }

  async getUnreadEmails(maxResults: number = 20): Promise<EmailMessage[]> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Get unread messages in primary inbox
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread in:inbox category:primary',
        maxResults,
      });

      const messages = response.data.messages || [];

      // Fetch full message details
      const emailPromises = messages.map(async (msg: any) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        return this.parseEmailMessage(details.data);
      });

      return Promise.all(emailPromises);
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.oauth2Client.refreshAccessToken();
        return this.getUnreadEmails(maxResults);
      }
      throw error;
    }
  }

  async getStarredEmails(maxResults: number = 20): Promise<EmailMessage[]> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:starred',
        maxResults,
      });

      const messages = response.data.messages || [];

      const emailPromises = messages.map(async (msg: any) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        return this.parseEmailMessage(details.data);
      });

      return Promise.all(emailPromises);
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.oauth2Client.refreshAccessToken();
        return this.getStarredEmails(maxResults);
      }
      throw error;
    }
  }

  async getUnreadStarredEmails(maxResults: number = 20): Promise<EmailMessage[]> {
    try {
      console.log('[GmailService] Fetching unread starred emails with query: is:starred is:unread');
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:starred is:unread',
        maxResults,
      });

      const messages = response.data.messages || [];
      console.log(`[GmailService] Found ${messages.length} unread starred message(s)`);

      if (messages.length === 0) {
        return [];
      }

      const emailPromises = messages.map(async (msg: any) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        return this.parseEmailMessage(details.data);
      });

      const emails = await Promise.all(emailPromises);
      console.log(`[GmailService] Successfully parsed ${emails.length} emails`);
      return emails;
    } catch (error: any) {
      console.error('[GmailService] Error fetching starred emails:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      if (error.response?.status === 401) {
        console.log('[GmailService] Token expired, refreshing...');
        await this.oauth2Client.refreshAccessToken();
        return this.getUnreadStarredEmails(maxResults);
      }
      throw error;
    }
  }

  async getImportantEmails(maxResults: number = 20): Promise<EmailMessage[]> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Get emails from the last 48 hours that are unread or starred
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const timestamp = Math.floor(twoDaysAgo.getTime() / 1000);

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: `(is:unread OR is:starred) in:inbox after:${timestamp}`,
        maxResults,
      });

      const messages = response.data.messages || [];

      const emailPromises = messages.map(async (msg: any) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        return this.parseEmailMessage(details.data);
      });

      return Promise.all(emailPromises);
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.oauth2Client.refreshAccessToken();
        return this.getImportantEmails(maxResults);
      }
      throw error;
    }
  }

  private parseEmailMessage(message: any): EmailMessage {
    const headers = message.payload.headers;
    const getHeader = (name: string) => {
      const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const isUnread = message.labelIds?.includes('UNREAD') || false;
    const isStarred = message.labelIds?.includes('STARRED') || false;

    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      snippet: message.snippet,
      date: getHeader('Date'),
      isUnread,
      isStarred,
      labels: message.labelIds || [],
    };
  }

  async getRefreshedTokens(): Promise<TokenData | null> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token,
        expiresAt: credentials.expiry_date,
      };
    } catch (error) {
      console.error('Failed to refresh tokens:', error);
      return null;
    }
  }
}
