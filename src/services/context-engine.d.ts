interface Suggestion {
    id: string;
    title: string;
    source: 'calendar' | 'email' | 'slack';
    sourceId: string;
    priority: 'low' | 'medium' | 'high';
    context?: string;
    dueDate?: string;
    score: number;
}
interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
}
interface EmailMessage {
    id: string;
    subject: string;
    from: string;
    snippet: string;
    date: string;
    isUnread: boolean;
    isStarred: boolean;
}
interface SlackMessage {
    id: string;
    type: 'mention' | 'dm' | 'thread' | 'saved' | 'channel';
    text: string;
    userName?: string;
    channelName?: string;
    timestamp: string;
}
export declare class ContextEngine {
    /**
     * Generate smart suggestions from calendar events
     */
    static generateCalendarSuggestions(events: CalendarEvent[]): Suggestion[];
    /**
     * Generate smart suggestions from emails
     */
    static generateEmailSuggestions(emails: EmailMessage[]): Suggestion[];
    /**
     * Generate smart suggestions from Slack messages
     */
    static generateSlackSuggestions(messages: SlackMessage[]): Suggestion[];
    /**
     * Combine all suggestions and apply smart filtering
     */
    static generateSmartSuggestions(calendarEvents: CalendarEvent[], emails: EmailMessage[], slackMessages: SlackMessage[]): Suggestion[];
    /**
     * Get context-aware greeting based on time of day
     */
    static getTimeContext(): string;
    /**
     * Extract name from email address
     */
    private static extractName;
}
export {};
