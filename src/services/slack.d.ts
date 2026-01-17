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
export declare class SlackService {
    private client;
    private clientId;
    private clientSecret;
    private redirectUri;
    constructor(clientId: string, clientSecret: string, redirectUri: string);
    setTokens(tokens: TokenData): void;
    exchangeCodeForTokens(code: string): Promise<TokenData>;
    getMentions(limit?: number): Promise<SlackMessage[]>;
    getDirectMessages(limit?: number): Promise<SlackMessage[]>;
    getUnreadThreads(limit?: number): Promise<SlackMessage[]>;
    getSavedItems(limit?: number): Promise<SlackMessage[]>;
    getImportantMessages(): Promise<SlackMessage[]>;
    private parseMessages;
    getUserInfo(userId: string): Promise<{
        name: string;
        realName: string;
    } | null>;
}
export {};
