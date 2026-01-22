import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';

interface SlackMessage {
  id: string;
  channelName: string;
  channelId: string;
  type: 'dm' | 'channel';
  text: string;
  user: string;
  userName?: string;
  timestamp: string;
  permalink?: string;
}

interface Email {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  timestamp: string;
  threadId: string;
}

interface ChatsProps {
  isPinned: boolean;
  onCountChange?: (count: number) => void;
}

export default function Chats({ isPinned: _isPinned, onCountChange }: ChatsProps) {
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Show loading on first render
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFocusTimeRef = useRef(0);

  useEffect(() => {
    loadMessages(true); // Initial load with loading state

    // Auto-refresh every 60 seconds for background updates
    const interval = setInterval(() => {
      loadMessages(false); // Background refresh without loading state
    }, 60000);

    // Debounced refresh when window gains focus
    let focusTimeout: NodeJS.Timeout;
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusTimeRef.current < 5000) {
        console.log('[Chats] Focus event too soon, ignoring');
        return;
      }

      lastFocusTimeRef.current = now;
      clearTimeout(focusTimeout);
      focusTimeout = setTimeout(() => {
        console.log('[Chats] Window focused, refreshing messages...');
        loadMessages(false); // Background refresh
      }, 500);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      clearTimeout(focusTimeout);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadMessages = async (showLoading = false) => {
    console.log('[Chats] ========== LOADING MESSAGES START ==========');
    console.log('[Chats] Show loading state:', showLoading);

    // Prevent multiple simultaneous loads
    if (isRefreshing) {
      console.log('[Chats] Already refreshing, skipping duplicate request');
      return;
    }

    setIsRefreshing(true);
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      console.log('[Chats] About to fetch Slack messages...');

      // Add timeout to prevent infinite hanging
      const slackPromise = window.electronAPI.getSlackUnreadMessages();
      const slackTimeout = new Promise<any[]>((resolve) => {
        setTimeout(() => {
          console.log('[Chats] Slack fetch timed out after 15 seconds');
          resolve([]);
        }, 15000);
      });

      const slackData = await Promise.race([slackPromise, slackTimeout]);
      console.log('[Chats] Slack messages received:', {
        count: slackData?.length || 0,
        isArray: Array.isArray(slackData)
      });
      setSlackMessages(slackData || []);

      console.log('[Chats] About to fetch starred emails...');

      // Add timeout to prevent infinite hanging
      const emailPromise = window.electronAPI.getStarredEmails();
      const emailTimeout = new Promise<any[]>((resolve) => {
        setTimeout(() => {
          console.log('[Chats] Email fetch timed out after 15 seconds');
          resolve([]);
        }, 15000);
      });

      const emailData = await Promise.race([emailPromise, emailTimeout]);
      console.log('[Chats] Starred emails received:', {
        count: emailData?.length || 0,
        isArray: Array.isArray(emailData)
      });
      setEmails(emailData || []);

      // Update count for notification badge
      const totalCount = (slackData?.length || 0) + (emailData?.length || 0);
      console.log('[Chats] Total message count:', totalCount);
      onCountChange?.(totalCount);
    } catch (err: any) {
      console.error('[Chats] Failed to load messages:', {
        error: err,
        message: err.message,
        stack: err.stack
      });
      setError(err.message || 'Failed to load messages');
    } finally {
      setIsRefreshing(false);
      if (showLoading) {
        setIsLoading(false);
      }
      console.log('[Chats] ========== LOADING MESSAGES COMPLETE ==========');
    }
  };

  const handleOpenSlackMessage = (message: SlackMessage) => {
    if (message.permalink) {
      window.electronAPI.openExternal(message.permalink);
    } else if (message.channelId) {
      // Fallback: open Slack to the DM conversation
      window.electronAPI.openExternal(`slack://channel?team=&id=${message.channelId}`);
    }

    // Refresh after 10 seconds to remove the message if it was marked as read
    setTimeout(() => {
      console.log('[Chats] Refreshing messages after opening Slack...');
      loadMessages(false); // Background refresh
    }, 10000);
  };

  const handleOpenEmail = (threadId: string) => {
    window.electronAPI.openExternal(`https://mail.google.com/mail/u/0/#inbox/${threadId}`);

    // Refresh after 10 seconds to remove the email if it was unstarred or marked as read
    setTimeout(() => {
      console.log('[Chats] Refreshing messages after opening email...');
      loadMessages(false); // Background refresh
    }, 10000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-dark-text-secondary">Loading messages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-dark-accent-danger">{error}</div>
      </div>
    );
  }

  const hasMessages = slackMessages.length > 0 || emails.length > 0;

  if (!hasMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-dark-text-secondary mb-2">No unread messages</div>
          <div className="text-xs text-dark-text-muted">
            Connect Slack and Gmail in Settings to see messages
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Slack Messages Section */}
      {slackMessages.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            Slack Messages ({slackMessages.length})
          </h3>
          <div className="space-y-2">
            {slackMessages.map((message) => (
              <div
                key={message.id}
                onClick={() => handleOpenSlackMessage(message)}
                className="bg-dark-surface border-l-4 border-l-blue-500 border-r border-t border-b border-dark-border rounded-lg p-3 hover:border-dark-accent-primary hover:border-l-blue-400 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                    <span className="text-sm font-medium text-dark-text-primary truncate">
                      {message.type === 'dm' ? (message.userName || message.user) : `#${message.channelName}`}
                    </span>
                  </div>
                  <span className="text-xs text-dark-text-muted flex-shrink-0">
                    {format(new Date(parseFloat(message.timestamp) * 1000), 'h:mm a')}
                  </span>
                </div>
                <div className="text-sm text-dark-text-secondary line-clamp-2">
                  {message.text}
                </div>
                {message.type === 'channel' && (
                  <div className="text-xs text-dark-text-muted mt-1">
                    From {message.user}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Starred Emails Section */}
      {emails.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            Starred Emails ({emails.length})
          </h3>
          <div className="space-y-2">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => handleOpenEmail(email.threadId)}
                className="bg-gradient-to-r from-purple-500/5 to-transparent border-l-4 border-l-purple-500 border-r border-t border-b border-dark-border rounded-lg p-3 hover:border-dark-accent-primary hover:border-l-purple-400 hover:from-purple-500/10 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-dark-text-primary truncate">
                      {email.subject || '(No subject)'}
                    </span>
                  </div>
                  <span className="text-xs text-dark-text-muted flex-shrink-0">
                    {format(new Date(email.timestamp), 'MMM d')}
                  </span>
                </div>
                <div className="text-xs text-dark-text-muted mb-1">
                  From: {email.from}
                </div>
                <div className="text-sm text-dark-text-secondary line-clamp-2">
                  {email.snippet}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
