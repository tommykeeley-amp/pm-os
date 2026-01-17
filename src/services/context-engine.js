var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { differenceInMinutes, differenceInHours, parseISO, isToday, isTomorrow } from 'date-fns';
var ContextEngine = /** @class */ (function () {
    function ContextEngine() {
    }
    /**
     * Generate smart suggestions from calendar events
     */
    ContextEngine.generateCalendarSuggestions = function (events) {
        var suggestions = [];
        var now = new Date();
        for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
            var event_1 = events_1[_i];
            var eventStart = parseISO(event_1.start);
            var minutesUntil = differenceInMinutes(eventStart, now);
            var hoursUntil = differenceInHours(eventStart, now);
            // Skip past events
            if (minutesUntil < 0)
                continue;
            var priority = 'medium';
            var context = '';
            // High priority if meeting is soon (< 30 minutes)
            if (minutesUntil <= 30) {
                priority = 'high';
                context = "In ".concat(minutesUntil, " minutes");
            }
            // Medium priority if today
            else if (isToday(eventStart)) {
                priority = 'medium';
                context = "Today at ".concat(eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
            }
            // Low priority if tomorrow or later
            else if (isTomorrow(eventStart)) {
                priority = 'low';
                context = "Tomorrow at ".concat(eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
            }
            else {
                priority = 'low';
                context = eventStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            // Calculate score (higher = more important)
            var score = 0;
            if (minutesUntil <= 30)
                score = 100;
            else if (hoursUntil <= 2)
                score = 80;
            else if (isToday(eventStart))
                score = 60;
            else if (isTomorrow(eventStart))
                score = 40;
            else
                score = 20;
            // Add location info if available
            if (event_1.location) {
                context += " \u2022 ".concat(event_1.location);
            }
            suggestions.push({
                id: "calendar_".concat(event_1.id),
                title: "Prepare for: ".concat(event_1.title),
                source: 'calendar',
                sourceId: event_1.id,
                priority: priority,
                context: context,
                dueDate: event_1.start,
                score: score,
            });
        }
        return suggestions;
    };
    /**
     * Generate smart suggestions from emails
     */
    ContextEngine.generateEmailSuggestions = function (emails) {
        var suggestions = [];
        var _loop_1 = function (email) {
            var priority = 'medium';
            var context = "From ".concat(this_1.extractName(email.from));
            var score = 50;
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
            var actionWords = ['urgent', 'asap', 'action required', 'deadline', 'reminder', 'follow up', 'response needed'];
            var subjectLower = email.subject.toLowerCase();
            if (actionWords.some(function (word) { return subjectLower.includes(word); })) {
                priority = 'high';
                score += 30;
            }
            suggestions.push({
                id: "email_".concat(email.id),
                title: "Reply: ".concat(email.subject),
                source: 'email',
                sourceId: email.id,
                priority: priority,
                context: context,
                score: score,
            });
        };
        var this_1 = this;
        for (var _i = 0, emails_1 = emails; _i < emails_1.length; _i++) {
            var email = emails_1[_i];
            _loop_1(email);
        }
        return suggestions;
    };
    /**
     * Generate smart suggestions from Slack messages
     */
    ContextEngine.generateSlackSuggestions = function (messages) {
        var suggestions = [];
        var now = Date.now() / 1000; // Convert to Unix timestamp
        for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
            var message = messages_1[_i];
            var messageTime = parseFloat(message.timestamp);
            var hoursAgo = (now - messageTime) / 3600;
            var priority = 'medium';
            var score = 50;
            var context = '';
            // Priority based on message type
            if (message.type === 'mention') {
                priority = 'high';
                score = 85;
                context = 'You were mentioned';
            }
            else if (message.type === 'dm') {
                priority = 'high';
                score = 80;
                context = 'Direct message';
            }
            else if (message.type === 'saved') {
                priority = 'medium';
                score = 70;
                context = 'Saved item';
            }
            else if (message.type === 'thread') {
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
                context += " from ".concat(message.userName);
            }
            if (message.channelName) {
                context += " in #".concat(message.channelName);
            }
            // Truncate message text for title
            var title = message.text.length > 60
                ? "".concat(message.text.substring(0, 60), "...")
                : message.text;
            suggestions.push({
                id: "slack_".concat(message.id),
                title: "Respond: ".concat(title),
                source: 'slack',
                sourceId: message.id,
                priority: priority,
                context: context,
                score: score,
            });
        }
        return suggestions;
    };
    /**
     * Combine all suggestions and apply smart filtering
     */
    ContextEngine.generateSmartSuggestions = function (calendarEvents, emails, slackMessages) {
        var calendarSuggestions = this.generateCalendarSuggestions(calendarEvents);
        var emailSuggestions = this.generateEmailSuggestions(emails);
        var slackSuggestions = this.generateSlackSuggestions(slackMessages);
        // Combine all suggestions
        var allSuggestions = __spreadArray(__spreadArray(__spreadArray([], calendarSuggestions, true), emailSuggestions, true), slackSuggestions, true);
        // Sort by score (highest first)
        allSuggestions.sort(function (a, b) { return b.score - a.score; });
        // Return top 10 suggestions
        return allSuggestions.slice(0, 10);
    };
    /**
     * Get context-aware greeting based on time of day
     */
    ContextEngine.getTimeContext = function () {
        var hour = new Date().getHours();
        if (hour < 12)
            return 'morning';
        if (hour < 17)
            return 'afternoon';
        return 'evening';
    };
    /**
     * Extract name from email address
     */
    ContextEngine.extractName = function (emailString) {
        // Extract name from "Name <email@example.com>" format
        var match = emailString.match(/^(.+?)\s*<.*>$/);
        if (match) {
            return match[1].replace(/["']/g, '');
        }
        // If no name, return email address
        return emailString.split('@')[0];
    };
    return ContextEngine;
}());
export { ContextEngine };
