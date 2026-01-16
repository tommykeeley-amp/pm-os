import { useState } from 'react';
import { format, parseISO } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface PendingRSVPCardProps {
  event: CalendarEvent;
  onRSVP: (eventId: string, status: 'accepted' | 'declined' | 'tentative') => Promise<void>;
}

export default function PendingRSVPCard({ event, onRSVP }: PendingRSVPCardProps) {
  const [isResponding, setIsResponding] = useState(false);

  const handleResponse = async (status: 'accepted' | 'declined' | 'tentative') => {
    setIsResponding(true);
    try {
      await onRSVP(event.id, status);
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-dark-text-primary truncate">
            {event.title}
          </div>
          <div className="text-xs text-dark-text-secondary mt-1">
            {format(parseISO(event.start), 'MMM d, h:mm a')} - {format(parseISO(event.end), 'h:mm a')}
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => handleResponse('accepted')}
            disabled={isResponding}
            className="px-2 py-1 text-xs bg-dark-accent-success text-white rounded hover:bg-dark-accent-success/90 disabled:opacity-50 transition-colors"
            title="Accept"
          >
            Yes
          </button>
          <button
            onClick={() => handleResponse('tentative')}
            disabled={isResponding}
            className="px-2 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-600/90 disabled:opacity-50 transition-colors"
            title="Maybe"
          >
            Maybe
          </button>
          <button
            onClick={() => handleResponse('declined')}
            disabled={isResponding}
            className="px-2 py-1 text-xs bg-dark-accent-danger text-white rounded hover:bg-dark-accent-danger/90 disabled:opacity-50 transition-colors"
            title="Decline"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
