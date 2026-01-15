import { google } from 'googleapis';
import { addDays, startOfDay, endOfDay } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class CalendarService {
  private oauth2Client: any;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

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
        attendees: event.attendees?.map((a: any) => a.email) || [],
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
        attendees: event.attendees?.map((a: any) => a.email) || [],
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
}
