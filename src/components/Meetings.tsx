import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import PendingRSVPCard from './PendingRSVPCard';
import CreateEventModal from './CreateEventModal';

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

interface MeetingsProps {
  isPinned: boolean;
}

export default function Meetings({ isPinned }: MeetingsProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDeclinedMeetings, setShowDeclinedMeetings] = useState(true);
  const [primaryTimezone, setPrimaryTimezone] = useState('America/New_York');
  const [secondaryTimezone, setSecondaryTimezone] = useState('America/Los_Angeles');
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);

  useEffect(() => {
    loadTodaysEvents();
    loadSettings();
  }, []);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.getUserSettings();
      // Default to true if not set
      setShowDeclinedMeetings(settings?.showDeclinedMeetings ?? true);
      setPrimaryTimezone(settings?.primaryTimezone || 'America/New_York');
      setSecondaryTimezone(settings?.secondaryTimezone || 'America/Los_Angeles');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadTodaysEvents = async () => {
    try {
      // Check if Google is connected
      const tokens = await window.electronAPI.getOAuthTokens('google');
      const connected = !!tokens.accessToken;
      setIsConnected(connected);

      if (!connected) {
        setIsLoading(false);
        return;
      }

      // Fetch calendar events
      const calendarEvents = await window.electronAPI.syncCalendar();

      // Filter for today's events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todaysEvents = calendarEvents.filter((event: CalendarEvent) => {
        const eventStart = new Date(event.start);
        return eventStart >= today && eventStart < tomorrow;
      });

      // Sort by start time
      todaysEvents.sort((a: CalendarEvent, b: CalendarEvent) => {
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

      setEvents(todaysEvents);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load calendar events:', error);
      setIsLoading(false);
    }
  };

  const isOOOEvent = (event: CalendarEvent) => {
    const title = event.title.toLowerCase();
    return title.includes('ooo') ||
           title.includes('out of office') ||
           title.includes('limited availability') ||
           title.includes('unavailable') ||
           title.includes('pto') ||
           title.includes('vacation');
  };

  const getEventColor = (event: CalendarEvent) => {
    // Check if user (self) has declined
    const userAttendee = event.attendees?.find(a => a.self);
    if (userAttendee?.responseStatus === 'declined') {
      return 'bg-purple-600/20 border-purple-600'; // Purple for declined
    }

    // Check if OOO/Limited Availability event
    if (isOOOEvent(event)) {
      return 'bg-gray-900/40 border-gray-900'; // Black for OOO
    }

    // Check if there are other participants (excluding self)
    const otherAttendees = event.attendees?.filter(a => !a.self) || [];
    if (otherAttendees.length === 0) {
      return 'bg-gray-900/40 border-gray-900'; // Black/dark grey for no other participants
    }

    // Yellow for normal events with other participants
    return 'bg-yellow-500/20 border-yellow-500';
  };

  const isDeclined = (event: CalendarEvent) => {
    const userAttendee = event.attendees?.find(a => a.self);
    return userAttendee?.responseStatus === 'declined';
  };

  const extractMeetingLink = (event: CalendarEvent): string | null => {
    // First, check for Google Meet hangout link (direct from API)
    if (event.hangoutLink) {
      console.log('Found hangoutLink:', event.hangoutLink);
      return event.hangoutLink;
    }

    // Second, check conferenceData for any video conference link
    if (event.conferenceData?.entryPoints) {
      for (const entryPoint of event.conferenceData.entryPoints) {
        if (entryPoint.entryPointType === 'video' && entryPoint.uri) {
          console.log('Found conferenceData video link:', entryPoint.uri);
          return entryPoint.uri;
        }
      }
    }

    // Third, search description and location for common meeting links
    const text = `${event.description || ''} ${event.location || ''}`;

    // Priority order: try to find specific meeting platforms
    const patterns = [
      // Zoom - various formats
      /https?:\/\/[^\s]*zoom\.us\/[^\s]*/gi,
      /https?:\/\/[^\s]*zoom\.com\/[^\s]*/gi,

      // Google Meet - various formats
      /https?:\/\/meet\.google\.com\/[^\s]*/gi,
      /https?:\/\/[^\s]*meet\.google\.com[^\s]*/gi,

      // Microsoft Teams
      /https?:\/\/teams\.microsoft\.com\/[^\s]*/gi,
      /https?:\/\/[^\s]*teams\.live\.com[^\s]*/gi,

      // Webex
      /https?:\/\/[^\s]*webex\.com\/[^\s]*/gi,

      // Generic video conferencing URLs (fallback)
      /https?:\/\/[^\s]*(meet|zoom|join|conference|video|call)[^\s]*/gi,
    ];

    // Try each pattern in order
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[0]) {
        // Clean up the URL (remove trailing punctuation, HTML tags, etc.)
        let url = match[0];

        // Remove common trailing characters that aren't part of the URL
        url = url.replace(/[,;.)}\]]+$/, '');

        // Remove HTML tags if present
        url = url.replace(/<[^>]*>/g, '');

        // Validate it's a proper URL
        try {
          new URL(url);
          console.log('Found meeting link in description/location:', url);
          return url;
        } catch {
          continue;
        }
      }
    }

    return null;
  };

  const handleOpenEvent = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();

    let url: string;

    if (event.htmlLink) {
      // Extract the eid parameter from htmlLink
      // Format: https://www.google.com/calendar/event?eid=...
      // We want: https://calendar.google.com/calendar/u/0/r/eventedit/{eid}
      try {
        const urlObj = new URL(event.htmlLink);
        const eid = urlObj.searchParams.get('eid');

        if (eid) {
          // Open in edit mode using the encoded event ID
          url = `https://calendar.google.com/calendar/u/0/r/eventedit/${eid}`;
          console.log('Opening event in edit mode with eid:', url);
        } else {
          // Fallback to just converting the domain
          url = event.htmlLink.replace('www.google.com/calendar', 'calendar.google.com/calendar');
          console.log('No eid found, opening with converted htmlLink:', url);
        }
      } catch (err) {
        console.error('Error parsing htmlLink:', err);
        url = event.htmlLink.replace('www.google.com/calendar', 'calendar.google.com/calendar');
      }
    } else {
      // Fallback to calendar home if no htmlLink
      url = 'https://calendar.google.com/';
      console.log('No htmlLink available, opening calendar home');
    }

    window.electronAPI.openExternal(url);
  };

  const handleLaunchMeeting = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const meetingLink = extractMeetingLink(event);
    if (meetingLink) {
      window.electronAPI.openExternal(meetingLink);
    }
  };

  const handleRSVP = async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
    try {
      const result = await window.electronAPI.calendarUpdateRSVP(eventId, status);

      if (result.success) {
        // Optimistic update
        setEvents(events.map(event => {
          if (event.id === eventId) {
            return {
              ...event,
              attendees: event.attendees?.map(a =>
                a.self ? { ...a, responseStatus: status } : a
              )
            };
          }
          return event;
        }));

        // Refresh after delay
        setTimeout(() => loadTodaysEvents(), 500);
      } else {
        alert(`Failed to update RSVP: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to update RSVP:', error);
      alert('Failed to update RSVP. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="text-dark-text-secondary">Loading events...</div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
        <svg
          className="w-12 h-12 text-dark-text-muted mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <div className="text-dark-text-secondary mb-2">
          Connect Google Calendar
        </div>
        <div className="text-xs text-dark-text-muted mb-4">
          View your meetings and events here
        </div>
        <button
          onClick={() => {
            // This will trigger opening settings
            const event = new CustomEvent('open-settings');
            window.dispatchEvent(event);
          }}
          className="px-4 py-2 bg-dark-accent-primary text-dark-bg rounded-lg text-sm font-medium
                   hover:bg-dark-accent-primary/90 transition-colors"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <svg
          className="w-12 h-12 text-dark-text-muted mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <div className="text-dark-text-secondary mb-2">No meetings today</div>
        <div className="text-xs text-dark-text-muted">
          Enjoy your free time!
        </div>
      </div>
    );
  }

  // Calculate event positioning based on time
  const getEventStyle = (event: CalendarEvent) => {
    const startTime = parseISO(event.start);
    const endTime = parseISO(event.end);

    // Define the day boundaries based on pinned mode
    // Pinned: 9AM to 6PM (9 hours)
    // Not pinned: 8AM to 7PM (11 hours) for more breathing room
    const dayStart = new Date(startTime);
    const dayEnd = new Date(startTime);

    if (isPinned) {
      dayStart.setHours(9, 0, 0, 0);
      dayEnd.setHours(18, 0, 0, 0);
    } else {
      dayStart.setHours(8, 0, 0, 0);
      dayEnd.setHours(19, 0, 0, 0);
    }

    const totalMinutes = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
    const eventStartMinutes = (startTime.getTime() - dayStart.getTime()) / (1000 * 60);
    const eventDuration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

    // Calculate percentages
    const topPercent = (eventStartMinutes / totalMinutes) * 100;
    const heightPercent = (eventDuration / totalMinutes) * 100;

    return {
      top: `${Math.max(0, topPercent)}%`,
      height: `${Math.max(2, heightPercent)}%`, // Minimum 2% height for visibility
    };
  };

  const timeLabels = isPinned
    ? ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM']
    : ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM'];

  const gridLines = isPinned ? 9 : 11;

  // Calculate current time position
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const dayStart = new Date(now);
    const dayEnd = new Date(now);

    if (isPinned) {
      dayStart.setHours(9, 0, 0, 0);
      dayEnd.setHours(18, 0, 0, 0);
    } else {
      dayStart.setHours(8, 0, 0, 0);
      dayEnd.setHours(19, 0, 0, 0);
    }

    // Only show line if current time is within the visible range
    if (now < dayStart || now > dayEnd) {
      return null;
    }

    const totalMinutes = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
    const currentMinutes = (now.getTime() - dayStart.getTime()) / (1000 * 60);
    const topPercent = (currentMinutes / totalMinutes) * 100;

    return topPercent;
  };

  const currentTimePosition = getCurrentTimePosition();

  // Filter pending RSVPs
  const pendingRSVPs = events.filter(event => {
    const userAttendee = event.attendees?.find(a => a.self);
    return userAttendee?.responseStatus === 'needsAction';
  });

  // Get timezone abbreviation
  const getTimezoneAbbr = (timezone: string) => {
    try {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      });
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find(part => part.type === 'timeZoneName');
      return tzPart?.value || '';
    } catch {
      return '';
    }
  };

  // Convert time from primary timezone to secondary timezone
  const convertToSecondaryTimezone = (timeLabel: string) => {
    // Parse the hour from label like "9 AM" or "12 PM"
    const [hourStr, period] = timeLabel.split(' ');
    let hour = parseInt(hourStr);

    // Convert to 24-hour format
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }

    // Create a date object for today at the specified hour in primary timezone
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`;

    try {
      // Create date and convert to secondary timezone
      const date = new Date(dateStr);
      const secondaryFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: secondaryTimezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      });

      const secondaryTime = secondaryFormatter.format(date);
      const secondaryAbbr = getTimezoneAbbr(secondaryTimezone);

      return `${secondaryTime} ${secondaryAbbr}`;
    } catch (error) {
      console.error('Timezone conversion error:', error);
      return timeLabel;
    }
  };

  return (
    <div className={`relative h-full ${!isPinned ? 'overflow-y-auto' : ''}`}>
      {/* Pending RSVPs Section */}
      {pendingRSVPs.length > 0 && (
        <div className="mb-6 space-y-2 px-4 pt-4">
          <h3 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            Pending RSVPs ({pendingRSVPs.length})
          </h3>
          {pendingRSVPs.map(event => (
            <PendingRSVPCard
              key={event.id}
              event={event}
              onRSVP={handleRSVP}
            />
          ))}
        </div>
      )}

      {/* Header with Create Event Button */}
      <div className="flex items-center justify-between mb-4 px-4">
        <h3 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider">
          Today's Schedule
        </h3>
        <button
          onClick={() => setShowCreateEventModal(true)}
          className="px-3 py-1.5 text-xs bg-dark-accent-primary text-white rounded-lg hover:bg-dark-accent-primary/90 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Event
        </button>
      </div>

      <div className={isPinned ? 'h-full' : 'min-h-[800px] relative'}>
        {/* Timezone label header */}
        <div className="absolute left-0 top-0 w-20 text-xs font-semibold text-dark-text-secondary border-b border-dark-border pb-1 pr-2 text-right">
          {getTimezoneAbbr(primaryTimezone)}
        </div>

        {/* Time labels - Primary timezone with Secondary on hover */}
        <div className="absolute left-0 top-6 bottom-0 w-20 flex flex-col text-xs text-dark-text-muted py-2">
          {timeLabels.map((label, i) => {
            const secondaryLabel = convertToSecondaryTimezone(label);
            return (
              <div
                key={i}
                className="flex-1 group relative cursor-default pr-2 flex flex-col justify-start text-right"
              >
                <div className="group-hover:text-dark-text-primary transition-colors">
                  {label}
                </div>
                {/* Secondary timezone label on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-dark-text-muted mt-0.5">
                  {secondaryLabel}
                </div>
              </div>
            );
          })}
        </div>

        {/* Events container */}
        <div className="absolute left-20 right-0 top-6 bottom-0 ml-2">
          {/* Hour grid lines */}
          <div className="absolute inset-0">
            {[...Array(gridLines)].map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-dark-border/30"
                style={{ top: `${(i / (gridLines - 1)) * 100}%` }}
              />
            ))}
          </div>

          {/* Current time indicator */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-0 right-0 z-10 pointer-events-none"
              style={{ top: `${currentTimePosition}%` }}
            >
              <div className="relative">
                {/* Circle dot on the left */}
                <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full border-2 border-dark-bg" />
                {/* Line */}
                <div className="h-0.5 bg-red-500" />
              </div>
            </div>
          )}

        {/* Events */}
        <div className="relative h-full">
          {events
            .filter(event => {
              // Filter out declined events if showDeclinedMeetings is false
              if (!showDeclinedMeetings && isDeclined(event)) {
                return false;
              }
              return true;
            })
            .map((event) => {
            const startTime = parseISO(event.start);
            const endTime = parseISO(event.end);
            const colorClass = getEventColor(event);
            const meetingLink = extractMeetingLink(event);
            const style = getEventStyle(event);

            return (
              <div
                key={event.id}
                className={`${colorClass} border-l-4 rounded-lg p-2 absolute left-0 right-0 group
                           hover:bg-opacity-30 transition-all overflow-hidden ${
                             isDeclined(event) ? 'opacity-70' : ''
                           }`}
                style={style}
              >
                <div className="flex-1 min-w-0 h-full flex flex-col">
                  <div className="flex items-center gap-1">
                    <div className="text-xs font-medium text-dark-text-primary truncate flex-1">
                      {event.title}
                    </div>
                    {isDeclined(event) && (
                      <div className="text-xs text-purple-400 font-semibold whitespace-nowrap">
                        DECLINED
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-dark-text-secondary">
                    {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                  </div>
                </div>

                {/* Hover buttons */}
                <div className="absolute inset-0 bg-dark-surface/95 rounded-lg opacity-0 group-hover:opacity-100
                              transition-opacity flex items-center justify-center gap-2 px-2">
                  <button
                    onClick={(e) => handleOpenEvent(event, e)}
                    className="flex-1 px-2 py-1.5 bg-dark-accent-primary text-dark-bg rounded-lg text-xs font-medium
                             hover:bg-dark-accent-primary/90 transition-colors"
                  >
                    Open Event
                  </button>
                  {meetingLink && (
                    <button
                      onClick={(e) => handleLaunchMeeting(event, e)}
                      className="flex-1 px-2 py-1.5 bg-dark-accent-success text-white rounded-lg text-xs font-medium
                               hover:bg-dark-accent-success/90 transition-colors"
                    >
                      Launch Meeting
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Create Event Modal */}
      {showCreateEventModal && (
        <CreateEventModal
          onClose={() => setShowCreateEventModal(false)}
          onSuccess={() => {
            setShowCreateEventModal(false);
            loadTodaysEvents();
          }}
        />
      )}
    </div>
  );
}
