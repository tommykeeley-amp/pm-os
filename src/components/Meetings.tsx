import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import PendingRSVPCard from './PendingRSVPCard';
import CreateEventModal from './CreateEventModal';
import MeetingInput from './MeetingInput';

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
  colorId?: string;
}

interface MeetingsProps {
  isPinned: boolean;
  onNextMeetingChange?: (time: string | null) => void;
  isActive?: boolean;
}

export default function Meetings({ isPinned, onNextMeetingChange, isActive }: MeetingsProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDeclinedMeetings, setShowDeclinedMeetings] = useState(true);
  const [primaryTimezone, setPrimaryTimezone] = useState('America/Los_Angeles');
  const [secondaryTimezone, setSecondaryTimezone] = useState('America/New_York');
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [initialMeetingTitle, setInitialMeetingTitle] = useState<string | undefined>(undefined);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  const handleCreateMeeting = (title: string) => {
    setInitialMeetingTitle(title);
    setShowCreateEventModal(true);
  };

  useEffect(() => {
    loadTodaysEvents();
    loadSettings();

    // Listen for OAuth success to refresh calendar
    const handleOAuthSuccess = (data: { provider: string }) => {
      if (data.provider === 'google') {
        console.log('[Meetings] Google OAuth success, reloading events...');
        loadTodaysEvents();
      }
    };

    window.electronAPI.onOAuthSuccess?.(handleOAuthSuccess);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Refresh events when tab becomes active
  useEffect(() => {
    if (isActive) {
      console.log('[Meetings] Tab became active, refreshing events...');
      loadTodaysEvents();
    }
  }, [isActive]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Calculate and update next meeting time
  useEffect(() => {
    if (!onNextMeetingChange) return;

    const now = currentTime.getTime();

    // Find the next meeting that hasn't started yet and isn't declined
    const upcomingEvents = events
      .filter(event => {
        const userAttendee = event.attendees?.find(a => a.self);
        const isDeclined = userAttendee?.responseStatus === 'declined';
        const eventStart = parseISO(event.start).getTime();
        return !isDeclined && eventStart > now;
      })
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());

    if (upcomingEvents.length === 0) {
      onNextMeetingChange(null);
      return;
    }

    const nextEvent = upcomingEvents[0];
    const nextEventTime = parseISO(nextEvent.start).getTime();
    const diffMs = nextEventTime - now;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    let timeString: string | null;
    if (diffMinutes < 60) {
      timeString = `${diffMinutes}m`;
    } else if (diffHours < 24) {
      timeString = `${diffHours}h`;
    } else {
      timeString = null;
    }

    onNextMeetingChange(timeString);
  }, [events, currentTime, onNextMeetingChange]);

  // Auto-scroll to current time when tab becomes active
  useEffect(() => {
    if (!timelineContainerRef.current || !isActive) return;

    // Small delay to ensure the DOM is ready
    setTimeout(() => {
      if (!timelineContainerRef.current) return;

      // Calculate current time position relative to timeline start
      const now = new Date();
      const timelineStart = new Date(now);
      timelineStart.setHours(timelineBounds.start, 0, 0, 0);
      const currentMinutes = (now.getTime() - timelineStart.getTime()) / (1000 * 60);
      const scrollPosition = (currentMinutes / 60) * PIXELS_PER_HOUR - 100; // offset by 100px to center better

      // Scroll to current time
      timelineContainerRef.current.scrollTop = Math.max(0, scrollPosition);
    }, 50);
  }, [isActive]);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.getUserSettings();
      // Default to true if not set
      setShowDeclinedMeetings(settings?.showDeclinedMeetings ?? true);
      setPrimaryTimezone(settings?.primaryTimezone || 'America/Los_Angeles');
      setSecondaryTimezone(settings?.secondaryTimezone || 'America/New_York');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadTodaysEvents = async () => {
    try {
      // Check if Google is connected
      const tokens = await window.electronAPI.getOAuthTokens('google');
      const connected = !!tokens.accessToken;
      console.log('[Meetings] Google connected:', connected);
      setIsConnected(connected);

      if (!connected) {
        console.log('[Meetings] Google not connected, skipping calendar fetch');
        setIsLoading(false);
        return;
      }

      // Fetch calendar events
      console.log('[Meetings] Fetching calendar events...');
      const calendarEvents = await window.electronAPI.syncCalendar();
      console.log('[Meetings] Fetched', calendarEvents?.length || 0, 'calendar events');

      // Filter for today's events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todaysEvents = calendarEvents.filter((event: CalendarEvent) => {
        const eventStart = new Date(event.start);
        return eventStart >= today && eventStart < tomorrow;
      });

      console.log('[Meetings] Today\'s events:', todaysEvents.length);

      // Sort by start time
      todaysEvents.sort((a: CalendarEvent, b: CalendarEvent) => {
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

      // Write events to file for debugging
      try {
        const debugData = {
          totalEvents: calendarEvents.length,
          todaysEventsCount: todaysEvents.length,
          todaysEvents: todaysEvents.map((e: CalendarEvent) => ({
            title: e.title,
            start: e.start,
            end: e.end,
            attendees: e.attendees?.map((a: Attendee) => ({
              email: a.email,
              responseStatus: a.responseStatus,
              self: a.self
            }))
          })),
          settings: {
            showDeclinedMeetings,
            primaryTimezone,
            secondaryTimezone,
            isPinned
          }
        };
        await window.electronAPI.writeDebugFile('meetings-debug.json', JSON.stringify(debugData, null, 2));
        console.log('[Meetings] Debug data written to meetings-debug.json');
      } catch (error) {
        console.error('[Meetings] Failed to write debug file:', error);
      }

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
           title.includes('vacation') ||
           title.includes('focus time') ||
           title.includes('block - dns');
  };

  const getEventColor = (event: CalendarEvent) => {
    // Google Calendar color mapping (colorId to Tailwind classes)
    const googleCalendarColors: Record<string, string> = {
      '1': 'bg-purple-400/20 border-purple-400', // Lavender
      '2': 'bg-green-400/20 border-green-400',   // Sage
      '3': 'bg-purple-600/20 border-purple-600', // Grape
      '4': 'bg-pink-400/20 border-pink-400',     // Flamingo
      '5': 'bg-yellow-300/20 border-yellow-300', // Banana
      '6': 'bg-orange-400/20 border-orange-400', // Tangerine
      '7': 'bg-cyan-400/20 border-cyan-400',     // Peacock
      '8': 'bg-gray-500/20 border-gray-500',     // Graphite
      '9': 'bg-blue-500/20 border-blue-500',     // Blueberry
      '10': 'bg-green-600/20 border-green-600',  // Basil
      '11': 'bg-red-500/20 border-red-500',      // Tomato
    };

    // If event has a Google Calendar colorId, use it
    if (event.colorId && googleCalendarColors[event.colorId]) {
      return googleCalendarColors[event.colorId];
    }

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

  // Always show the timeline, even if there are no events

  // Fixed timeline boundaries: 8 AM to 8 PM
  const timelineBounds = { start: 8, end: 20 };

  // Calculate event positioning based on time with fixed pixel heights
  const PIXELS_PER_HOUR = 120;
  const getEventStyle = (event: CalendarEvent) => {
    const startTime = parseISO(event.start);
    const endTime = parseISO(event.end);

    // Position events relative to timeline start (8 AM)
    const dayStart = new Date(startTime);
    dayStart.setHours(timelineBounds.start, 0, 0, 0);

    // Calculate minutes from timeline start
    const eventStartMinutes = (startTime.getTime() - dayStart.getTime()) / (1000 * 60);
    const eventDuration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

    // Convert to pixels (120px per hour = 2px per minute)
    const topPx = (eventStartMinutes / 60) * PIXELS_PER_HOUR;
    const heightPx = Math.max(20, (eventDuration / 60) * PIXELS_PER_HOUR); // Minimum 20px height

    return {
      top: `${topPx}px`,
      height: `${heightPx}px`,
    };
  };

  // Generate time labels based on dynamic boundaries
  const generateTimeLabels = () => {
    const labels = [];
    for (let hour = timelineBounds.start; hour <= timelineBounds.end; hour++) {
      if (hour === 0) labels.push('12 AM');
      else if (hour < 12) labels.push(`${hour} AM`);
      else if (hour === 12) labels.push('12 PM');
      else labels.push(`${hour - 12} PM`);
    }
    return labels;
  };

  const timeLabels = generateTimeLabels();
  const gridLines = timelineBounds.end - timelineBounds.start;

  // Calculate current time position in pixels
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const dayStart = new Date(now);
    dayStart.setHours(timelineBounds.start, 0, 0, 0); // Timeline start (8 AM)

    // Calculate minutes from timeline start
    const currentMinutes = (now.getTime() - dayStart.getTime()) / (1000 * 60);
    const topPx = (currentMinutes / 60) * PIXELS_PER_HOUR;

    // Only show if within visible range
    if (topPx < 0) return null;

    return topPx;
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
      // Remove AM/PM from the time
      const timeWithoutPeriod = secondaryTime.replace(/\s?(AM|PM)$/i, '');
      const secondaryAbbr = getTimezoneAbbr(secondaryTimezone);

      return `${timeWithoutPeriod} ${secondaryAbbr}`;
    } catch (error) {
      console.error('Timezone conversion error:', error);
      return timeLabel;
    }
  };

  return (
    <div className={`relative h-full flex flex-col ${!isPinned ? 'overflow-y-auto' : ''}`}>
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

      {/* Meeting Input */}
      <div className={`px-4 mb-4 ${pendingRSVPs.length === 0 ? 'pt-4' : ''}`}>
        <MeetingInput onCreateMeeting={handleCreateMeeting} isActive={isActive} />
      </div>

      {/* Header with Create Event Button */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider">
            Today's Schedule
          </h3>
          <span className="text-xs text-dark-text-muted">
            {getTimezoneAbbr(primaryTimezone)}
          </span>
        </div>
      </div>

      {/* Timeline container - scrollable with fixed height per hour */}
      <div ref={timelineContainerRef} className="flex-1 px-4 flex flex-row overflow-y-auto">

        {/* Time labels column - fixed height per hour block */}
        <div className="w-11 flex flex-col text-xs text-dark-text-muted flex-shrink-0 whitespace-nowrap" style={{ paddingBottom: '8px' }}>
          {timeLabels.map((label, i) => {
            const secondaryLabel = convertToSecondaryTimezone(label);
            return (
              <div
                key={i}
                className="group relative cursor-default pr-2 flex flex-col justify-start text-right"
                style={{ minHeight: '120px' }}
              >
                <div className="group-hover:text-dark-text-primary transition-colors">
                  {label}
                </div>
                {/* Secondary timezone label on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-dark-text-muted mt-0.5 whitespace-nowrap">
                  {secondaryLabel}
                </div>
              </div>
            );
          })}
        </div>

        {/* Events container - relative positioning with timeline height */}
        <div className="relative ml-3" style={{ minHeight: `${gridLines * PIXELS_PER_HOUR}px`, flex: 1 }}>
          {/* Hour grid lines */}
          <div className="absolute inset-0">
            {[...Array(gridLines)].map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-dark-border/30"
                style={{ top: `${i * PIXELS_PER_HOUR}px` }}
              />
            ))}
          </div>

          {/* Current time indicator */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-0 right-0 z-10 pointer-events-none"
              style={{ top: `${currentTimePosition}px` }}
            >
              <div className="relative">
                {/* Circle dot on the left */}
                <div className="absolute -left-2 -top-1.5 w-3 h-3 bg-red-500 rounded-full border border-dark-bg" />
                {/* Line */}
                <div className="h-0.5 bg-red-500/80" />
              </div>
            </div>
          )}

          {/* Events */}
          {(() => {
            const filteredEvents = events.filter(event => {
              // Filter out declined events if showDeclinedMeetings is false
              if (!showDeclinedMeetings && isDeclined(event)) {
                console.log('[Meetings] Filtering out declined event:', event.title);
                return false;
              }

              // Show all events regardless of time range (Option 3)
              return true;
            });
            console.log('[Meetings] Filtered events count:', filteredEvents.length, 'of', events.length);

            // Calculate overlapping event columns for side-by-side layout
            const eventsWithLayout = filteredEvents.map(event => ({
              event,
              startTime: parseISO(event.start),
              endTime: parseISO(event.end),
              column: 0,
              totalColumns: 1,
            }));

            // Sort by start time
            eventsWithLayout.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

            // Find overlap groups and assign columns
            const processed = new Set<number>();

            for (let i = 0; i < eventsWithLayout.length; i++) {
              if (processed.has(i)) continue;

              const current = eventsWithLayout[i];
              const group = [current];
              processed.add(i);

              // Find all events that overlap with any event in the group
              let changed = true;
              while (changed) {
                changed = false;
                for (let j = 0; j < eventsWithLayout.length; j++) {
                  if (processed.has(j)) continue;

                  const candidate = eventsWithLayout[j];

                  // Check if candidate overlaps with any event in group
                  for (const groupEvent of group) {
                    if (candidate.startTime < groupEvent.endTime &&
                        candidate.endTime > groupEvent.startTime) {
                      group.push(candidate);
                      processed.add(j);
                      changed = true;
                      break;
                    }
                  }
                }
              }

              // Assign columns to this group
              if (group.length > 1) {
                // Sort by start time, then by duration (longer first)
                group.sort((a, b) => {
                  const timeDiff = a.startTime.getTime() - b.startTime.getTime();
                  if (timeDiff !== 0) return timeDiff;
                  return (b.endTime.getTime() - b.startTime.getTime()) -
                         (a.endTime.getTime() - a.startTime.getTime());
                });

                // Simple even split - each event gets equal width
                const totalColumns = group.length;
                group.forEach((item, index) => {
                  item.column = index;
                  item.totalColumns = totalColumns;
                });
              }
            }

            return eventsWithLayout.map(({ event, column, totalColumns }) => {
            const startTime = parseISO(event.start);
            const endTime = parseISO(event.end);
            const colorClass = getEventColor(event);
            const meetingLink = extractMeetingLink(event);
            const baseStyle = getEventStyle(event);

            // Calculate width and left offset based on column
            const widthPercent = 100 / totalColumns;
            const leftPercent = (column / totalColumns) * 100;

            const style = {
              ...baseStyle,
              width: `${widthPercent}%`,
              left: `${leftPercent}%`,
            };

            return (
              <div
                key={event.id}
                className={`${colorClass} border-l-4 rounded-lg p-2 absolute group
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
          });
          })()}
        </div>
      </div>

      {/* Create Event Modal */}
      {showCreateEventModal && (
        <CreateEventModal
          initialTitle={initialMeetingTitle}
          onClose={() => {
            setShowCreateEventModal(false);
            setInitialMeetingTitle(undefined);
          }}
          onSuccess={() => {
            setShowCreateEventModal(false);
            setInitialMeetingTitle(undefined);
            loadTodaysEvents();
          }}
        />
      )}
    </div>
  );
}
