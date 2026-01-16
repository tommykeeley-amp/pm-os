import Store from 'electron-store';
import { CalendarService } from '../src/services/calendar';
import { GmailService } from '../src/services/gmail';
import { SlackService } from '../src/services/slack';
import { ZoomService } from '../src/services/zoom';
import { ContextEngine } from '../src/services/context-engine';

const store = new Store();

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
    // Check if Google OAuth scope needs update
    const scopeValid = this.checkAndHandleScopeUpdate();

    // Initialize Google services if tokens exist and scope is valid
    const googleTokens = this.getStoredTokens('google');
    if (googleTokens?.accessToken && scopeValid) {
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
  }

  // Check and handle OAuth scope updates
  checkAndHandleScopeUpdate(): boolean {
    const storedVersion = store.get('google_oauth_scope_version', 1) as number;
    if (storedVersion < REQUIRED_GOOGLE_SCOPE_VERSION) {
      // Clear outdated tokens
      store.delete('google_access_token');
      store.delete('google_refresh_token');
      store.delete('google_expires_at');
      return false; // Needs re-auth
    }
    return true; // OK
  }

  // Exchange OAuth code for tokens (Google)
  async connectGoogle(code: string) {
    const calendarService = new CalendarService(
      this.googleClientId,
      this.googleClientSecret,
      this.redirectUri
    );

    const tokens = await calendarService.exchangeCodeForTokens(code);
    this.saveTokens('google', tokens);

    // Save scope version after successful connection
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
    return {
      accessToken: store.get(`${provider}_access_token`) as string,
      refreshToken: store.get(`${provider}_refresh_token`) as string,
      expiresAt: store.get(`${provider}_expires_at`) as number,
    };
  }

  // Save tokens to store
  private saveTokens(provider: string, tokens: any) {
    store.set(`${provider}_access_token`, tokens.accessToken);
    if (tokens.refreshToken) {
      store.set(`${provider}_refresh_token`, tokens.refreshToken);
    }
    if (tokens.expiresAt) {
      store.set(`${provider}_expires_at`, tokens.expiresAt);
    }
  }

  // Check if services are connected
  isGoogleConnected(): boolean {
    return !!this.calendarService;
  }

  isSlackConnected(): boolean {
    return !!this.slackService;
  }
}
