import axios from 'axios';

interface ZoomTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ZoomMeetingRequest {
  topic: string;
  start_time: string; // ISO 8601
  duration: number; // minutes
  timezone?: string;
}

interface ZoomMeeting {
  id: string;
  join_url: string;
  start_url: string;
  password?: string;
}

export class ZoomService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  // @ts-ignore - stored for future token expiry checking
  private _expiresAt: number | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string
  ) {}

  setTokens(tokens: ZoomTokenData): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this._expiresAt = tokens.expiresAt;
  }

  async exchangeCodeForTokens(code: string): Promise<ZoomTokenData> {
    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await axios.post('https://zoom.us/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
      },
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = response.data;
    const expiresAt = Date.now() + data.expires_in * 1000;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };
  }

  async createMeeting(request: ZoomMeetingRequest): Promise<ZoomMeeting> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const response = await axios.post(
        'https://api.zoom.us/v2/users/me/meetings',
        {
          topic: request.topic,
          type: 2, // Scheduled meeting
          start_time: request.start_time,
          duration: request.duration,
          timezone: request.timezone || 'UTC',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: true,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        id: response.data.id,
        join_url: response.data.join_url,
        start_url: response.data.start_url,
        password: response.data.password,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token expired, try to refresh
        const refreshedTokens = await this.getRefreshedTokens();
        if (refreshedTokens) {
          this.setTokens(refreshedTokens);
          return this.createMeeting(request);
        }
      }
      throw error;
    }
  }

  async getRefreshedTokens(): Promise<ZoomTokenData | null> {
    if (!this.refreshToken) {
      return null;
    }

    try {
      const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        },
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const data = response.data;
      const expiresAt = Date.now() + data.expires_in * 1000;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
      };
    } catch (error) {
      console.error('Failed to refresh Zoom token:', error);
      return null;
    }
  }
}

export type { ZoomTokenData, ZoomMeetingRequest, ZoomMeeting };
