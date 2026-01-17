import { google } from 'googleapis';
import { addDays, startOfDay, endOfDay } from 'date-fns';
import * as fs from 'fs';

// Direct file logging helper
function logToFile(message: string) {
  try {
    fs.appendFileSync('/tmp/pm-os-oauth-debug.log', `${message}\n`);
  } catch (e) {
    // Ignore logging errors
  }
}

interface Attendee {
  email: string;
  responseStatus?: string;
  self?: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: Attendee[];
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: any;
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface CreateEventRequest {
  summary: string;
  description?: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  attendees?: string[]; // Array of email addresses
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey: {
        type: string;
      };
    };
    entryPoints?: Array<{
      entryPointType: 'video';
      uri: string;
      label?: string;
    }>;
  };
}

export class CalendarService {
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

    console.log('[CalendarService] Constructor called');
    console.log('[CalendarService] Client ID:', clientId);
    console.log('[CalendarService] Redirect URI:', redirectUri);

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
    logToFile('[CalendarService] ===== TOKEN EXCHANGE START =====');
    logToFile(`[CalendarService] Code received (first 30 chars): ${code.substring(0, 30)}...`);
    logToFile(`[CalendarService] Client ID: ${this._clientId}`);
    logToFile(`[CalendarService] Redirect URI: ${this._redirectUri}`);
    logToFile(`[CalendarService] Client Secret (first 10 chars): ${this._clientSecret.substring(0, 10)}...`);

    console.log('[CalendarService] ===== TOKEN EXCHANGE START =====');
    console.log('[CalendarService] Code received (first 30 chars):', code.substring(0, 30) + '...');
    console.log('[CalendarService] Client ID:', this._clientId);
    console.log('[CalendarService] Redirect URI:', this._redirectUri);
    console.log('[CalendarService] Client Secret (first 10 chars):', this._clientSecret.substring(0, 10) + '...');

    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      logToFile('[CalendarService] Token exchange SUCCESS');
      logToFile(`[CalendarService] Received access token: ${tokens.access_token ? 'YES' : 'NO'}`);
      logToFile(`[CalendarService] Received refresh token: ${tokens.refresh_token ? 'YES' : 'NO'}`);
      logToFile(`[CalendarService] Token expiry: ${tokens.expiry_date}`);

      console.log('[CalendarService] Token exchange SUCCESS');
      console.log('[CalendarService] Received access token:', tokens.access_token ? 'YES' : 'NO');
      console.log('[CalendarService] Received refresh token:', tokens.refresh_token ? 'YES' : 'NO');
      console.log('[CalendarService] Token expiry:', tokens.expiry_date);

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date,
      };
    } catch (error: any) {
      logToFile('[CalendarService] Token exchange FAILED');
      logToFile(`[CalendarService] Error: ${error.message}`);
      logToFile(`[CalendarService] Error response: ${JSON.stringify(error.response?.data, null, 2)}`);

      console.error('[CalendarService] Token exchange FAILED');
      console.error('[CalendarService] Error:', error.message);
      console.error('[CalendarService] Error response:', JSON.stringify(error.response?.data, null, 2));
      throw error;
    }
  }

  async getUpcomingEvents(daysAhead: number = 7): Promise<CalendarEvent[]> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const now = new Date();
      const futureDate = addDays(now, daysAhead);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: futureDate.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      return events.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        description: event.description,
        location: event.location,
        attendees: event.attendees?.map((a: any) => ({
          email: a.email,
          responseStatus: a.responseStatus,
          self: a.self,
        })) || [],
        htmlLink: event.htmlLink,
        hangoutLink: event.hangoutLink,
        conferenceData: event.conferenceData,
      }));
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token expired, try to refresh
        await this.oauth2Client.refreshAccessToken();
        return this.getUpcomingEvents(daysAhead);
      }
      throw error;
    }
  }

  async getTodayEvents(): Promise<CalendarEvent[]> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const start = startOfDay(new Date());
      const end = endOfDay(new Date());

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      return events.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        description: event.description,
        location: event.location,
        attendees: event.attendees?.map((a: any) => ({
          email: a.email,
          responseStatus: a.responseStatus,
          self: a.self,
        })) || [],
        htmlLink: event.htmlLink,
        hangoutLink: event.hangoutLink,
        conferenceData: event.conferenceData,
      }));
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.oauth2Client.refreshAccessToken();
        return this.getTodayEvents();
      }
      throw error;
    }
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

  async updateEventAttendeeStatus(
    eventId: string,
    responseStatus: 'accepted' | 'declined' | 'tentative'
  ): Promise<void> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      // Get user email for updating correct attendee
      const profile = await this.oauth2Client.getTokenInfo(this.oauth2Client.credentials.access_token);
      const userEmail = profile.email;

      await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: {
          attendees: [{
            email: userEmail,
            responseStatus: responseStatus,
            self: true
          }]
        },
        sendUpdates: 'all', // Notify other attendees
      });
    } catch (error: any) {
      if (error.code === 401) {
        // Token expired, try to refresh
        const refreshedTokens = await this.getRefreshedTokens();
        if (refreshedTokens) {
          this.setTokens(refreshedTokens);
          return this.updateEventAttendeeStatus(eventId, responseStatus);
        }
      }
      throw error;
    }
  }

  async createEvent(request: CreateEventRequest): Promise<CalendarEvent> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: {
          summary: request.summary,
          description: request.description,
          start: {
            dateTime: request.start,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          end: {
            dateTime: request.end,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          attendees: request.attendees?.map(email => ({ email })),
          conferenceData: request.conferenceData,
        },
      });

      const event = response.data;
      return {
        id: event.id!,
        title: event.summary || 'Untitled Event',
        start: event.start?.dateTime || event.start?.date || '',
        end: event.end?.dateTime || event.end?.date || '',
        description: event.description || undefined,
        location: event.location || undefined,
        attendees: event.attendees?.map(a => ({
          email: a.email!,
          responseStatus: a.responseStatus || undefined,
          self: a.self || undefined,
        })),
        htmlLink: event.htmlLink || undefined,
        hangoutLink: event.hangoutLink || undefined,
        conferenceData: event.conferenceData,
      };
    } catch (error: any) {
      if (error.code === 401) {
        const refreshedTokens = await this.getRefreshedTokens();
        if (refreshedTokens) {
          this.setTokens(refreshedTokens);
          return this.createEvent(request);
        }
      }
      throw error;
    }
  }
}

export type { CalendarEvent, Attendee, TokenData, CreateEventRequest };
