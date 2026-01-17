import Store from 'electron-store';
import * as fs from 'fs';
import { CalendarService } from '../src/services/calendar';
import { GmailService } from '../src/services/gmail';
import { SlackService } from '../src/services/slack';
import { ZoomService } from '../src/services/zoom';
import { ContextEngine } from '../src/services/context-engine';

const store = new Store();

// Direct file logging helper
function logToFile(message: string) {
  try {
    fs.appendFileSync('/tmp/pm-os-oauth-debug.log', `${message}\n`);
  } catch (e) {
    // Ignore logging errors
    console.error('logToFile failed:', e);
  }
}

// Test logging on module load
logToFile('[IntegrationManager] MODULE LOADED - logToFile is working');

// OAuth scope version tracking
const REQUIRED_GOOGLE_SCOPE_VERSION = 2;

export class IntegrationManager {
  private calendarService: CalendarService | null = null;
  private gmailService: GmailService | null = null;
  private slackService: SlackService | null = null;
  private zoomService: ZoomService | null = null;

  constructor(
    private googleClientId: string,
    private googleClientSecret: string,
    private slackClientId: string,
    private slackClientSecret: string,
    zoomClientId: string,
    zoomClientSecret: string,
    private redirectUri: string
  ) {
    // Initialize Zoom service
    this.zoomService = new ZoomService(zoomClientId, zoomClientSecret, redirectUri);
  }

  // Initialize services with stored tokens
  async initialize() {
    console.log('[IntegrationManager] ===== INITIALIZATION START =====');

    // Check if Google OAuth scope needs update
    const scopeValid = this.checkAndHandleScopeUpdate();
    console.log(`[IntegrationManager] Scope valid: ${scopeValid}`);

    // Initialize Google services if tokens exist and scope is valid
    let googleTokens = this.getStoredTokens('google');

    // If we have a refresh token but no access token, try to refresh
    if (scopeValid && googleTokens?.refreshToken && !googleTokens?.accessToken) {
      try {
        console.log('[IntegrationManager] Access token missing but refresh token exists, attempting refresh...');
        const tempCalendarService = new CalendarService(
          this.googleClientId,
          this.googleClientSecret,
          this.redirectUri
        );
        tempCalendarService.setTokens(googleTokens);

        const refreshedTokens = await tempCalendarService.getRefreshedTokens();
        if (refreshedTokens) {
          console.log('[IntegrationManager] Token refresh successful');
          this.saveTokens('google', refreshedTokens);
          googleTokens = refreshedTokens;
        }
      } catch (error) {
        console.error('[IntegrationManager] Failed to refresh tokens during initialization:', error);
      }
    }

    if (googleTokens?.accessToken && scopeValid) {
      console.log('[IntegrationManager] Initializing Google services with valid tokens');
      this.calendarService = new CalendarService(
        this.googleClientId,
        this.googleClientSecret,
        this.redirectUri
      );
      this.calendarService.setTokens(googleTokens);

      this.gmailService = new GmailService(
        this.googleClientId,
        this.googleClientSecret,
        this.redirectUri
      );
      this.gmailService.setTokens(googleTokens);
      console.log('[IntegrationManager] Google services initialized successfully');
    } else {
      console.log('[IntegrationManager] NOT initializing Google services - missing tokens or invalid scope');
      console.log(`[IntegrationManager] Has access token: ${!!googleTokens?.accessToken}`);
      console.log(`[IntegrationManager] Scope valid: ${scopeValid}`);
    }

    // Initialize Slack service if tokens exist
    const slackTokens = this.getStoredTokens('slack');
    if (slackTokens?.accessToken) {
      this.slackService = new SlackService(
        this.slackClientId,
        this.slackClientSecret,
        this.redirectUri
      );
      this.slackService.setTokens(slackTokens);
    }

    // Initialize Zoom if tokens exist
    const zoomTokens = this.getStoredTokens('zoom');
    if (zoomTokens.accessToken) {
      this.zoomService?.setTokens(zoomTokens);
    }

    console.log('[IntegrationManager] ===== INITIALIZATION COMPLETE =====');
  }

  // Check and handle OAuth scope updates
  checkAndHandleScopeUpdate(): boolean {
    const storedVersion = store.get('google_oauth_scope_version', 1) as number;
    console.log(`[IntegrationManager] Scope version check: stored=${storedVersion}, required=${REQUIRED_GOOGLE_SCOPE_VERSION}`);
    if (storedVersion < REQUIRED_GOOGLE_SCOPE_VERSION) {
      console.log('[IntegrationManager] Scope version outdated, clearing tokens...');
      // Clear outdated tokens
      store.delete('google_access_token');
      store.delete('google_refresh_token');
      store.delete('google_expires_at');
      return false; // Needs re-auth
    }
    console.log('[IntegrationManager] Scope version valid');
    return true; // OK
  }

  // Exchange OAuth code for tokens (Google)
  async connectGoogle(code: string) {
    logToFile('[IntegrationManager] ===== connectGoogle CALLED =====');
    logToFile(`[IntegrationManager] Code (first 30 chars): ${code.substring(0, 30)}`);
    logToFile(`[IntegrationManager] googleClientId: ${this.googleClientId}`);
    logToFile(`[IntegrationManager] redirectUri: ${this.redirectUri}`);

    console.log('[IntegrationManager] ===== connectGoogle CALLED =====');
    console.log('[IntegrationManager] Code (first 30 chars):', code.substring(0, 30));
    console.log('[IntegrationManager] googleClientId:', this.googleClientId);
    console.log('[IntegrationManager] redirectUri:', this.redirectUri);
    console.log('[IntegrationManager] Exchanging Google OAuth code for tokens...');

    const calendarService = new CalendarService(
      this.googleClientId,
      this.googleClientSecret,
      this.redirectUri
    );

    logToFile('[IntegrationManager] CalendarService created, about to exchange code...');
    console.log('[IntegrationManager] CalendarService created, about to exchange code...');
    const tokens = await calendarService.exchangeCodeForTokens(code);
    console.log('[IntegrationManager] Tokens received, saving...');
    this.saveTokens('google', tokens);

    // Save scope version after successful connection
    console.log(`[IntegrationManager] Setting scope version to ${REQUIRED_GOOGLE_SCOPE_VERSION}`);
    store.set('google_oauth_scope_version', REQUIRED_GOOGLE_SCOPE_VERSION);

    // Initialize services
    this.calendarService = calendarService;
    this.calendarService.setTokens(tokens);

    this.gmailService = new GmailService(
      this.googleClientId,
      this.googleClientSecret,
      this.redirectUri
    );
    this.gmailService.setTokens(tokens);

    console.log('[IntegrationManager] Google connection complete');
    return tokens;
  }

  // Exchange OAuth code for tokens (Slack)
  async connectSlack(code: string) {
    const slackService = new SlackService(
      this.slackClientId,
      this.slackClientSecret,
      this.redirectUri
    );

    const tokens = await slackService.exchangeCodeForTokens(code);
    this.saveTokens('slack', tokens);

    // Initialize service
    this.slackService = slackService;
    this.slackService.setTokens(tokens);

    return tokens;
  }

  // Exchange OAuth code for tokens (Zoom)
  async connectZoom(code: string): Promise<void> {
    if (!this.zoomService) {
      throw new Error('Zoom service not initialized');
    }

    const tokens = await this.zoomService.exchangeCodeForTokens(code);
    this.zoomService.setTokens(tokens);
    this.saveTokens('zoom', tokens);
  }

  // Update event RSVP status
  async updateEventRSVP(eventId: string, responseStatus: 'accepted' | 'declined' | 'tentative'): Promise<void> {
    if (!this.calendarService) {
      throw new Error('Calendar service not initialized');
    }
    await this.calendarService.updateEventAttendeeStatus(eventId, responseStatus);
  }

  // Create calendar event
  async createCalendarEvent(request: any): Promise<any> {
    if (!this.calendarService) {
      throw new Error('Calendar service not initialized');
    }
    return await this.calendarService.createEvent(request);
  }

  // Create Zoom meeting
  async createZoomMeeting(request: any): Promise<any> {
    if (!this.zoomService) {
      throw new Error('Zoom service not initialized');
    }
    return await this.zoomService.createMeeting(request);
  }

  // Check if Zoom is configured
  isZoomConfigured(): boolean {
    const tokens = this.getStoredTokens('zoom');
    return !!tokens.accessToken;
  }

  // Sync calendar events
  async syncCalendar() {
    if (!this.calendarService) {
      throw new Error('Calendar service not initialized. Please connect Google account first.');
    }

    try {
      const events = await this.calendarService.getUpcomingEvents(7);
      return events;
    } catch (error: any) {
      // Try to refresh tokens if unauthorized
      if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        await this.refreshGoogleTokens();
        const events = await this.calendarService.getUpcomingEvents(7);
        return events;
      }
      throw error;
    }
  }

  // Sync Gmail
  async syncGmail() {
    if (!this.gmailService) {
      throw new Error('Gmail service not initialized. Please connect Google account first.');
    }

    try {
      const emails = await this.gmailService.getImportantEmails(20);
      return emails;
    } catch (error: any) {
      if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        await this.refreshGoogleTokens();
        const emails = await this.gmailService.getImportantEmails(20);
        return emails;
      }
      throw error;
    }
  }

  // Sync Slack
  async syncSlack() {
    if (!this.slackService) {
      throw new Error('Slack service not initialized. Please connect Slack account first.');
    }

    try {
      const messages = await this.slackService.getImportantMessages();
      return messages;
    } catch (error) {
      throw error;
    }
  }

  // Generate smart suggestions
  async getSmartSuggestions() {
    const calendarEvents = this.calendarService
      ? await this.syncCalendar().catch(() => [])
      : [];
    const emails = this.gmailService ? await this.syncGmail().catch(() => []) : [];
    const slackMessages = this.slackService ? await this.syncSlack().catch(() => []) : [];

    const suggestions = ContextEngine.generateSmartSuggestions(
      calendarEvents,
      emails,
      slackMessages
    );

    return suggestions;
  }

  // Get Slack unread messages
  async getSlackUnreadMessages() {
    if (!this.slackService) {
      return [];
    }

    try {
      // Get selected channel IDs from user settings
      const userSettings = store.get('user_settings', {}) as any;
      const selectedChannelIds = userSettings.slackChannels || [];

      const messages = await this.slackService.getUnreadMessages(selectedChannelIds);

      // Enrich messages with user names
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          if (msg.user) {
            const userInfo = await this.slackService!.getUserInfo(msg.user);
            return {
              ...msg,
              user: userInfo?.realName || userInfo?.name || msg.user,
            };
          }
          return msg;
        })
      );

      return enrichedMessages;
    } catch (error) {
      console.error('Failed to get Slack unread messages:', error);
      return [];
    }
  }

  // Get starred emails
  async getStarredEmails() {
    if (!this.gmailService) {
      console.error('[getStarredEmails] Gmail service not initialized');
      return [];
    }

    try {
      console.log('[getStarredEmails] Fetching unread starred emails...');
      const emails = await this.gmailService.getUnreadStarredEmails(20);
      console.log(`[getStarredEmails] Found ${emails.length} unread starred emails`);
      return emails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        snippet: email.snippet,
        timestamp: email.date,
        threadId: email.threadId,
      }));
    } catch (error: any) {
      console.error('[getStarredEmails] Error details:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });

      if (error.response?.status === 401 || error.message?.includes('401') || error.message?.includes('unauthorized')) {
        console.log('[getStarredEmails] Refreshing tokens and retrying...');
        await this.refreshGoogleTokens();
        const emails = await this.gmailService.getUnreadStarredEmails(20);
        return emails.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          snippet: email.snippet,
          timestamp: email.date,
          threadId: email.threadId,
        }));
      }
      console.error('Failed to get starred emails:', error);
      return [];
    }
  }

  // Get Slack channels
  async getSlackChannels() {
    if (!this.slackService) {
      return [];
    }

    try {
      return await this.slackService.getChannels();
    } catch (error) {
      console.error('Failed to get Slack channels:', error);
      return [];
    }
  }

  // Refresh Google tokens
  private async refreshGoogleTokens() {
    if (!this.calendarService) return;

    const newTokens = await this.calendarService.getRefreshedTokens();
    if (newTokens) {
      this.saveTokens('google', newTokens);
      this.calendarService.setTokens(newTokens);
      if (this.gmailService) {
        this.gmailService.setTokens(newTokens);
      }
    }
  }

  // Get stored tokens
  private getStoredTokens(provider: string) {
    const tokens = {
      accessToken: store.get(`${provider}_access_token`) as string,
      refreshToken: store.get(`${provider}_refresh_token`) as string,
      expiresAt: store.get(`${provider}_expires_at`) as number,
    };
    console.log(`[IntegrationManager] getStoredTokens for ${provider}:`, {
      accessToken: tokens.accessToken ? `YES (length: ${tokens.accessToken.length})` : 'NO',
      refreshToken: tokens.refreshToken ? 'YES' : 'NO',
      expiresAt: tokens.expiresAt
    });
    return tokens;
  }

  // Save tokens to store
  private saveTokens(provider: string, tokens: any) {
    console.log(`[IntegrationManager] saveTokens called for ${provider}`);
    console.log(`[IntegrationManager] Saving access token: ${tokens.accessToken ? 'YES (length: ' + tokens.accessToken.length + ')' : 'NO'}`);
    console.log(`[IntegrationManager] Saving refresh token: ${tokens.refreshToken ? 'YES' : 'NO'}`);
    console.log(`[IntegrationManager] Saving expiresAt: ${tokens.expiresAt}`);

    store.set(`${provider}_access_token`, tokens.accessToken);
    if (tokens.refreshToken) {
      store.set(`${provider}_refresh_token`, tokens.refreshToken);
    }
    if (tokens.expiresAt) {
      store.set(`${provider}_expires_at`, tokens.expiresAt);
    }

    // Verify tokens were saved
    const saved = {
      accessToken: store.get(`${provider}_access_token`),
      refreshToken: store.get(`${provider}_refresh_token`),
      expiresAt: store.get(`${provider}_expires_at`)
    };
    console.log(`[IntegrationManager] Verification - tokens saved successfully:`, {
      accessToken: saved.accessToken ? 'YES' : 'NO',
      refreshToken: saved.refreshToken ? 'YES' : 'NO',
      expiresAt: saved.expiresAt
    });
  }

  // Check if services are connected
  isGoogleConnected(): boolean {
    return !!this.calendarService;
  }

  isSlackConnected(): boolean {
    return !!this.slackService;
  }
}
