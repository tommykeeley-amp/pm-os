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
export declare class CalendarService {
    private oauth2Client;
    private clientId;
    private clientSecret;
    private redirectUri;
    constructor(clientId: string, clientSecret: string, redirectUri: string);
    setTokens(tokens: TokenData): void;
    exchangeCodeForTokens(code: string): Promise<TokenData>;
    getUpcomingEvents(daysAhead?: number): Promise<CalendarEvent[]>;
    getTodayEvents(): Promise<CalendarEvent[]>;
    getRefreshedTokens(): Promise<TokenData | null>;
}
export {};
