import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface SlackMessage {
  id: string;
  channelName: string;
  channelId: string;
  type: 'dm' | 'channel';
  text: string;
  user: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadMessages();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadMessages = async () => {
    console.log('[Chats] Loading messages...');
    setIsLoading(true);
    setError(null);

    try {
      // Fetch Slack messages
      console.log('[Chats] Fetching Slack messages...');
      const slackData = await window.electronAPI.getSlackUnreadMessages();
      console.log('[Chats] Slack messages received:', slackData?.length || 0);
      setSlackMessages(slackData || []);

      // Fetch important emails (includes starred emails)
      console.log('[Chats] Fetching important emails...');
      const emailData = await window.electronAPI.syncGmail();
      console.log('[Chats] Emails received:', emailData?.length || 0, emailData);
      // Filter for starred emails only
      const starredEmails = emailData?.filter((email: any) => email.isStarred) || [];
      console.log('[Chats] Starred emails after filter:', starredEmails.length);
      const mappedEmails = starredEmails.map((email: any) => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        snippet: email.snippet,
        timestamp: email.date,
        threadId: email.threadId,
      }));
      setEmails(mappedEmails);

      // Update count for notification badge
      const totalCount = (slackData?.length || 0) + mappedEmails.length;
      onCountChange?.(totalCount);
    } catch (err: any) {
      console.error('[Chats] Failed to load messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
      console.log('[Chats] Loading complete');
    }
  };

  const handleOpenSlackMessage = (permalink: string) => {
    if (permalink) {
      window.electronAPI.openExternal(permalink);
    }
  };

  const handleOpenEmail = (threadId: string) => {
    window.electronAPI.openExternal(`https://mail.google.com/mail/u/0/#inbox/${threadId}`);
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
                onClick={() => message.permalink && handleOpenSlackMessage(message.permalink)}
                className="bg-dark-surface border border-dark-border rounded-lg p-3 hover:border-dark-accent-primary transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-dark-text-primary truncate">
                      {message.type === 'dm' ? `DM from ${message.user}` : `#${message.channelName}`}
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
                className="bg-dark-surface border border-dark-border rounded-lg p-3 hover:border-dark-accent-primary transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
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
