import { differenceInMinutes, differenceInHours, parseISO, isToday, isTomorrow, isPast } from 'date-fns';

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
  type: 'mention' | 'dm' | 'thread' | 'saved';
  text: string;
  userName?: string;
  channelName?: string;
  timestamp: string;
}

export class ContextEngine {
  /**
   * Generate smart suggestions from calendar events
   */
  static generateCalendarSuggestions(events: CalendarEvent[]): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const now = new Date();

    for (const event of events) {
      const eventStart = parseISO(event.start);
      const minutesUntil = differenceInMinutes(eventStart, now);
      const hoursUntil = differenceInHours(eventStart, now);

      // Skip past events
      if (minutesUntil < 0) continue;

      let priority: 'low' | 'medium' | 'high' = 'medium';
      let context = '';

      // High priority if meeting is soon (< 30 minutes)
      if (minutesUntil <= 30) {
        priority = 'high';
        context = `In ${minutesUntil} minutes`;
      }
      // Medium priority if today
      else if (isToday(eventStart)) {
        priority = 'medium';
        context = `Today at ${eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      }
      // Low priority if tomorrow or later
      else if (isTomorrow(eventStart)) {
        priority = 'low';
        context = `Tomorrow at ${eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      } else {
        priority = 'low';
        context = eventStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      // Calculate score (higher = more important)
      let score = 0;
      if (minutesUntil <= 30) score = 100;
      else if (hoursUntil <= 2) score = 80;
      else if (isToday(eventStart)) score = 60;
      else if (isTomorrow(eventStart)) score = 40;
      else score = 20;

      // Add location info if available
      if (event.location) {
        context += ` • ${event.location}`;
      }

      suggestions.push({
        id: `calendar_${event.id}`,
        title: `Prepare for: ${event.title}`,
        source: 'calendar',
        sourceId: event.id,
        priority,
        context,
        dueDate: event.start,
        score,
      });
    }

    return suggestions;
  }

  /**
   * Generate smart suggestions from emails
   */
  static generateEmailSuggestions(emails: EmailMessage[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const email of emails) {
      let priority: 'low' | 'medium' | 'high' = 'medium';
      let context = `From ${this.extractName(email.from)}`;
      let score = 50;

      // High priority if starred
      if (email.isStarred) {
        priority = 'high';
        score = 90;
      }

      // Increase priority if unread
      if (email.isUnread) {
        score += 20;
      }

      // Check for action words in subject
      const actionWords = ['urgent', 'asap', 'action required', 'deadline', 'reminder', 'follow up', 'response needed'];
      const subjectLower = email.subject.toLowerCase();

      if (actionWords.some(word => subjectLower.includes(word))) {
        priority = 'high';
        score += 30;
      }

      suggestions.push({
        id: `email_${email.id}`,
        title: `Reply: ${email.subject}`,
        source: 'email',
        sourceId: email.id,
        priority,
        context,
        score,
      });
    }

    return suggestions;
  }

  /**
   * Generate smart suggestions from Slack messages
   */
  static generateSlackSuggestions(messages: SlackMessage[]): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const now = Date.now() / 1000; // Convert to Unix timestamp

    for (const message of messages) {
      const messageTime = parseFloat(message.timestamp);
      const hoursAgo = (now - messageTime) / 3600;

      let priority: 'low' | 'medium' | 'high' = 'medium';
      let score = 50;
      let context = '';

      // Priority based on message type
      if (message.type === 'mention') {
        priority = 'high';
        score = 85;
        context = 'You were mentioned';
      } else if (message.type === 'dm') {
        priority = 'high';
        score = 80;
        context = 'Direct message';
      } else if (message.type === 'saved') {
        priority = 'medium';
        score = 70;
        context = 'Saved item';
      } else if (message.type === 'thread') {
        priority = 'medium';
        score = 60;
        context = 'Thread activity';
      }

      // Increase priority if recent (< 6 hours)
      if (hoursAgo < 6) {
        score += 20;
      }

      // Add user/channel context
      if (message.userName) {
        context += ` from ${message.userName}`;
      }
      if (message.channelName) {
        context += ` in #${message.channelName}`;
      }

      // Truncate message text for title
      const title = message.text.length > 60
        ? `${message.text.substring(0, 60)}...`
        : message.text;

      suggestions.push({
        id: `slack_${message.id}`,
        title: `Respond: ${title}`,
        source: 'slack',
        sourceId: message.id,
        priority,
        context,
        score,
      });
    }

    return suggestions;
  }

  /**
   * Combine all suggestions and apply smart filtering
   */
  static generateSmartSuggestions(
    calendarEvents: CalendarEvent[],
    emails: EmailMessage[],
    slackMessages: SlackMessage[]
  ): Suggestion[] {
    const calendarSuggestions = this.generateCalendarSuggestions(calendarEvents);
    const emailSuggestions = this.generateEmailSuggestions(emails);
    const slackSuggestions = this.generateSlackSuggestions(slackMessages);

    // Combine all suggestions
    const allSuggestions = [
      ...calendarSuggestions,
      ...emailSuggestions,
      ...slackSuggestions,
    ];

    // Sort by score (highest first)
    allSuggestions.sort((a, b) => b.score - a.score);

    // Return top 10 suggestions
    return allSuggestions.slice(0, 10);
  }

  /**
   * Get context-aware greeting based on time of day
   */
  static getTimeContext(): string {
    const hour = new Date().getHours();

    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  /**
   * Extract name from email address
   */
  private static extractName(emailString: string): string {
    // Extract name from "Name <email@example.com>" format
    const match = emailString.match(/^(.+?)\s*<.*>$/);
    if (match) {
      return match[1].replace(/["']/g, '');
    }

    // If no name, return email address
    return emailString.split('@')[0];
  }
}
