import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface CreateEventModalProps {
  onClose: () => void;
  onSuccess: (event: any) => void;
  initialTitle?: string;
}

export default function CreateEventModal({ onClose, onSuccess, initialTitle }: CreateEventModalProps) {
  const [title, setTitle] = useState(initialTitle || '');
  const [attendees, setAttendees] = useState('');
  const [startDate, setStartDate] = useState(() => {
    return format(new Date(), 'yyyy-MM-dd');
  });
  const [startTimeStr, setStartTimeStr] = useState(() => {
    const now = new Date();
    const nextHalfHour = Math.ceil(now.getMinutes() / 30) * 30;
    now.setMinutes(nextHalfHour);
    now.setSeconds(0);
    return format(now, 'HH:mm');
  });
  const [duration, setDuration] = useState(30);
  const [addMeetLink, setAddMeetLink] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');

  useEffect(() => {
    // Load user's primary timezone
    const loadTimezone = async () => {
      try {
        const settings = await window.electronAPI.getUserSettings();
        if (settings?.primaryTimezone) {
          setTimezone(settings.primaryTimezone);
        }
      } catch (error) {
        console.error('Failed to load timezone:', error);
      }
    };
    loadTimezone();
  }, []);

  // Generate time options (every 15 minutes)
  const timeOptions = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeOptions.push(timeStr);
    }
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // Combine date and time
      const start = new Date(`${startDate}T${startTimeStr}`);
      const end = new Date(start.getTime() + duration * 60000);

      // Request Google Meet link if requested
      const conferenceData = addMeetLink ? {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      } : undefined;

      const result = await window.electronAPI.calendarCreateEvent({
        summary: title,
        start: start.toISOString(),
        end: end.toISOString(),
        attendees: attendees.split(',').map(e => e.trim()).filter(e => e),
        conferenceData,
      });

      if (result.success) {
        onSuccess(result.event);
      } else {
        setError(result.error || 'Failed to create event');
        setIsCreating(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create event');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-lg mx-4 animate-slide-in">
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-text-primary">Create Event</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-dark-accent-danger/10 border border-dark-accent-danger/20 rounded-lg p-3">
              <p className="text-sm text-dark-accent-danger">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
              placeholder="Meeting title"
              disabled={isCreating}
              autoFocus
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary cursor-pointer [color-scheme:dark]"
              disabled={isCreating}
            />
          </div>

          {/* Start Time */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Start Time ({timezone})
            </label>
            <select
              value={startTimeStr}
              onChange={(e) => setStartTimeStr(e.target.value)}
              className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
              disabled={isCreating}
            >
              {timeOptions.map(time => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
              disabled={isCreating}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          {/* Attendees */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Attendees
            </label>
            <input
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
              placeholder="email@example.com, another@example.com"
              disabled={isCreating}
            />
            <p className="text-xs text-dark-text-muted mt-1">
              Separate multiple emails with commas
            </p>
          </div>

          {/* Google Meet checkbox */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="add-meet"
              checked={addMeetLink}
              onChange={(e) => setAddMeetLink(e.target.checked)}
              disabled={isCreating}
              className="mt-0.5"
            />
            <div className="flex-1">
              <label
                htmlFor="add-meet"
                className="text-sm font-medium text-dark-text-primary cursor-pointer"
              >
                Add Google Meet link
              </label>
              <p className="text-xs text-dark-text-muted mt-1">
                Automatically creates a video conference link
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={isCreating || !title.trim()}
              className="flex-1 px-6 py-2 bg-dark-accent-primary text-white rounded-lg hover:bg-dark-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? 'Creating...' : 'Create Event'}
            </button>
            <button
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 bg-dark-bg hover:bg-dark-border text-dark-text-primary rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
