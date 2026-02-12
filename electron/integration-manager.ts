import Store from 'electron-store';
import * as fs from 'fs';
import { CalendarService } from '../src/services/calendar';
import { GmailService } from '../src/services/gmail';
import { SlackService } from '../src/services/slack';
import { ZoomService } from '../src/services/zoom';
import { ContextEngine } from '../src/services/context-engine';

const store = new Store();

// Direct file logging helper
import * as os from 'os';
import * as path from 'path';

const slackLogFilePath = path.join(os.homedir(), 'pm-os-slack-debug.log');

function logToFile(message: string) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    fs.appendFileSync(slackLogFilePath, logMessage + '\n');
    console.log(message);
  } catch (e) {
    // Ignore logging errors
    console.error('logToFile failed:', e);
  }
}

// Test logging on module load
logToFile('[IntegrationManager] MODULE LOADED - logToFile is working');

// OAuth scope version tracking
const REQUIRED_GOOGLE_SCOPE_VERSION = 3; // v3: Added Google Contacts scope for email lookup

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

    // Save bot token separately if present
    if (tokens.botToken) {
      store.set('slack_bot_token', tokens.botToken);
      store.set('slack_team_url', tokens.teamUrl);
    }

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

  // Update calendar event
  async updateCalendarEvent(eventId: string, updates: any): Promise<any> {
    if (!this.calendarService) {
      throw new Error('Calendar service not initialized');
    }
    return await this.calendarService.updateEvent(eventId, updates);
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
      // Use getTodayEvents to include both past and future events from today
      const events = await this.calendarService.getTodayEvents();
      return events;
    } catch (error: any) {
      // Try to refresh tokens if unauthorized
      if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        await this.refreshGoogleTokens();
        const events = await this.calendarService.getTodayEvents();
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

    // Get dismissed suggestions from storage
    const dismissedSuggestions = store.get('dismissed_suggestions', []) as string[];

    // Filter out dismissed suggestions and only keep high-conviction ones (score >= 70)
    const filteredSuggestions = suggestions.filter(
      (suggestion: any) =>
        !dismissedSuggestions.includes(suggestion.id) && suggestion.score >= 70
    );

    return filteredSuggestions;
  }

  // Get Slack unread messages
  async getSlackUnreadMessages() {
    logToFile('[IntegrationManager.getSlackUnreadMessages] ========== START ==========');
    logToFile(`[IntegrationManager.getSlackUnreadMessages] Slack service initialized: ${!!this.slackService}`);

    if (!this.slackService) {
      logToFile('[IntegrationManager.getSlackUnreadMessages] Slack service not initialized, returning empty array');
      return [];
    }

    try {
      // Get user settings to find selected channels
      const userSettings = store.get('userSettings', {}) as any;
      const selectedChannels = userSettings.slackChannels || [];
      logToFile(`[IntegrationManager.getSlackUnreadMessages] Selected channels: ${JSON.stringify(selectedChannels)}`);

      // Fetch all message types in parallel
      logToFile('[IntegrationManager.getSlackUnreadMessages] Fetching all message types...');
      const [directMessages, mentions, threads, starredMessages, channelMessages] = await Promise.all([
        this.slackService.getDirectMessages(),
        this.slackService.getMentions(),
        this.slackService.getUnreadThreads(),
        this.slackService.getSavedItems(),
        selectedChannels.length > 0 ? this.slackService.getUnreadMessages(selectedChannels) : Promise.resolve([])
      ]);

      logToFile(`[IntegrationManager.getSlackUnreadMessages] Fetched: ${JSON.stringify({
        dmCount: directMessages?.length || 0,
        mentionsCount: mentions?.length || 0,
        threadsCount: threads?.length || 0,
        starredCount: starredMessages?.length || 0,
        channelCount: channelMessages?.length || 0
      })}`);

      // Filter mentions, threads, and starred messages to only selected channels
      // DMs are always included regardless of channel selection
      // If NO channels selected, show ONLY DMs (no channel messages)
      // If channels ARE selected, show DMs + messages from those channels
      const selectedChannelSet = new Set(selectedChannels);
      const hasSelectedChannels = selectedChannels.length > 0;

      const filteredMentions = mentions.filter(msg =>
        msg.type === 'dm' || (hasSelectedChannels && selectedChannelSet.has(msg.channel))
      );

      const filteredThreads = threads.filter(msg =>
        msg.type === 'dm' || (hasSelectedChannels && selectedChannelSet.has(msg.channel))
      );

      const filteredStarred = starredMessages.filter(msg =>
        msg.type === 'dm' || (hasSelectedChannels && selectedChannelSet.has(msg.channel))
      );

      logToFile(`[IntegrationManager.getSlackUnreadMessages] After filtering to selected channels: ${JSON.stringify({
        filteredMentionsCount: filteredMentions.length,
        filteredThreadsCount: filteredThreads.length,
        filteredStarredCount: filteredStarred.length
      })}`);

      // Combine all messages and remove duplicates by ID
      const allMessages = [
        ...directMessages,
        ...filteredMentions,
        ...filteredThreads,
        ...filteredStarred,
        ...channelMessages
      ];

      // Remove duplicates (a message might be both a mention and in a thread)
      const uniqueMessages = Array.from(
        new Map(allMessages.map(msg => [msg.id, msg])).values()
      );

      const messages = uniqueMessages;
      logToFile(`[IntegrationManager.getSlackUnreadMessages] Total unique messages: ${JSON.stringify({
        totalCount: messages.length
      })}`);

      // Map messages to the format expected by the UI
      const mappedMessages = messages.map(msg => ({
        id: msg.id,
        channelId: msg.channel,
        channelName: msg.channelName || '',
        type: msg.type,
        text: msg.text,
        user: msg.user,
        userName: msg.userName || msg.user,
        timestamp: msg.timestamp,
        permalink: msg.permalink,
      }));

      logToFile(`[IntegrationManager.getSlackUnreadMessages] Mapped messages: ${JSON.stringify({
        count: mappedMessages.length,
        messages: mappedMessages
      })}`);
      logToFile('[IntegrationManager.getSlackUnreadMessages] ========== COMPLETE ==========');
      return mappedMessages;
    } catch (error) {
      console.error('[IntegrationManager.getSlackUnreadMessages] ERROR:', {
        error: error,
        message: (error as any)?.message,
        stack: (error as any)?.stack
      });
      return [];
    }
  }

  // Get starred emails
  async getStarredEmails() {
    console.log('[IntegrationManager.getStarredEmails] ========== START ==========');
    console.log('[IntegrationManager.getStarredEmails] Gmail service initialized:', !!this.gmailService);

    if (!this.gmailService) {
      console.error('[IntegrationManager.getStarredEmails] Gmail service not initialized, returning empty array');
      return [];
    }

    // Check token health before making API call
    const tokens = this.getStoredTokens('google');
    const now = Date.now();
    const isExpired = tokens.expiresAt && now > tokens.expiresAt;
    console.log('[IntegrationManager.getStarredEmails] Token health:', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : 'unknown',
      isExpired,
      timeUntilExpiry: tokens.expiresAt ? `${Math.round((tokens.expiresAt - now) / 1000 / 60)}min` : 'unknown',
    });

    // Proactively refresh if expired
    if (isExpired && tokens.refreshToken) {
      console.log('[IntegrationManager.getStarredEmails] Token expired, refreshing proactively...');
      try {
        await this.refreshGoogleTokens();
        console.log('[IntegrationManager.getStarredEmails] Proactive token refresh successful');
      } catch (refreshError: any) {
        console.error('[IntegrationManager.getStarredEmails] Proactive token refresh failed:', refreshError);
        // Continue anyway, let the API call handle it
      }
    }

    try {
      console.log('[IntegrationManager.getStarredEmails] Calling gmailService.getUnreadStarredEmails...');
      const startTime = Date.now();
      const emails = await this.gmailService.getUnreadStarredEmails(20);
      const duration = Date.now() - startTime;

      console.log('[IntegrationManager.getStarredEmails] Raw emails from service:', {
        count: emails.length,
        duration: `${duration}ms`,
        emails: emails
      });

      const mappedEmails = emails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        snippet: email.snippet,
        timestamp: email.date,
        threadId: email.threadId,
      }));

      console.log('[IntegrationManager.getStarredEmails] Mapped emails:', {
        count: mappedEmails.length,
        emails: mappedEmails
      });
      console.log('[IntegrationManager.getStarredEmails] ========== COMPLETE ==========');
      return mappedEmails;
    } catch (error: any) {
      console.error('[IntegrationManager.getStarredEmails] ERROR:', {
        error: error,
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        stack: error.stack
      });

      if (error.response?.status === 401 || error.message?.includes('401') || error.message?.includes('unauthorized')) {
        console.log('[IntegrationManager.getStarredEmails] Refreshing tokens and retrying...');
        await this.refreshGoogleTokens();
        const emails = await this.gmailService.getUnreadStarredEmails(20);
        const mappedEmails = emails.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          snippet: email.snippet,
          timestamp: email.date,
          threadId: email.threadId,
        }));
        console.log('[IntegrationManager.getStarredEmails] After token refresh:', {
          count: mappedEmails.length,
          emails: mappedEmails
        });
        return mappedEmails;
      }
      console.error('[IntegrationManager.getStarredEmails] Failed to get starred emails:', error);
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

  // Get Slack users
  async getSlackUsers() {
    if (!this.slackService) {
      return [];
    }

    try {
      return await this.slackService.getUsers();
    } catch (error) {
      console.error('Failed to get Slack users:', error);
      return [];
    }
  }

  // Get Slack thread replies
  async getSlackThreadReplies(channelId: string, threadTs: string) {
    if (!this.slackService) {
      return [];
    }

    try {
      return await this.slackService.getThreadReplies(channelId, threadTs);
    } catch (error) {
      console.error('Failed to get Slack thread replies:', error);
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
