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
export declare class GmailService {
    private oauth2Client;
    private clientId;
    private clientSecret;
    private redirectUri;
    constructor(clientId: string, clientSecret: string, redirectUri: string);
    setTokens(tokens: TokenData): void;
    exchangeCodeForTokens(code: string): Promise<TokenData>;
    getUnreadEmails(maxResults?: number): Promise<EmailMessage[]>;
    getStarredEmails(maxResults?: number): Promise<EmailMessage[]>;
    getImportantEmails(maxResults?: number): Promise<EmailMessage[]>;
    private parseEmailMessage;
    getRefreshedTokens(): Promise<TokenData | null>;
}
export {};
