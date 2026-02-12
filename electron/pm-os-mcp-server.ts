#!/usr/bin/env node

/**
 * PM-OS MCP Server
 * Exposes PM-OS capabilities (tasks, Jira, etc.) as MCP tools for Claude Code
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { google } from 'googleapis';

// Logging to file for debugging
const LOG_FILE = path.join(os.homedir(), 'pm-os-mcp-debug.log');
function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

// Override console.log to also write to file
const originalLog = console.log;
console.log = function(...args: any[]) {
  const message = args.join(' ');
  originalLog.apply(console, args);
  logToFile(message);
};

// Path to electron-store config file
const CONFIG_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'pm-os', 'config.json');

// Helper functions to read/write store data
function readStore(): any {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (error) {
    console.error('[PM-OS MCP] Error reading store:', error);
  }
  return {};
}

function writeStore(data: any): void {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[PM-OS MCP] Error writing store:', error);
  }
}

// Simple fetch wrapper using https module
function httpRequest(url: string, options: any): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const statusCode = res.statusCode || 500;
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          json: async () => JSON.parse(data),
          text: async () => data,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  source?: string;
  sourceId?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  deadline?: string;
}

// MCP Protocol Handler
class PMOSMCPServer {
  constructor() {
    this.setupStdioHandler();
  }

  private setupStdioHandler() {
    let buffer = '';

    process.stdin.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete JSON messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            this.sendError('parse_error', 'Invalid JSON');
          }
        }
      }
    });

    process.stdin.resume();
  }

  private async handleMessage(message: any) {
    const { method, params, id } = message;

    try {
      switch (method) {
        case 'initialize':
          this.sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'pm-os-mcp-server',
              version: '1.0.0',
            },
          });
          break;

        case 'tools/list':
          this.sendResponse(id, {
            tools: [
              {
                name: 'create_task',
                description: 'Create a new task in PM-OS',
                inputSchema: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'The task title/description',
                    },
                    priority: {
                      type: 'string',
                      enum: ['low', 'medium', 'high'],
                      description: 'Task priority (optional, defaults to medium)',
                    },
                    deadline: {
                      type: 'string',
                      description: 'Deadline date in YYYY-MM-DD format (optional)',
                    },
                  },
                  required: ['title'],
                },
              },
              {
                name: 'list_tasks',
                description: 'List all tasks in PM-OS',
                inputSchema: {
                  type: 'object',
                  properties: {
                    completed: {
                      type: 'boolean',
                      description: 'Filter by completion status (optional)',
                    },
                  },
                },
              },
              {
                name: 'update_task',
                description: 'Update a task in PM-OS',
                inputSchema: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      description: 'Task ID',
                    },
                    completed: {
                      type: 'boolean',
                      description: 'Mark task as completed/incomplete',
                    },
                    title: {
                      type: 'string',
                      description: 'Update task title',
                    },
                  },
                  required: ['id'],
                },
              },
              {
                name: 'create_jira_ticket',
                description: 'Create a Jira ticket',
                inputSchema: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'string',
                      description: 'Ticket summary/title',
                    },
                    description: {
                      type: 'string',
                      description: 'Ticket description (optional)',
                    },
                    projectKey: {
                      type: 'string',
                      description: 'Jira project key (optional, uses default if not provided)',
                    },
                    issueType: {
                      type: 'string',
                      description: 'Issue type like Task, Bug, Story (optional, uses default if not provided)',
                    },
                  },
                  required: ['summary'],
                },
              },
              {
                name: 'list_calendar_events',
                description: 'List Google Calendar events within a date range',
                inputSchema: {
                  type: 'object',
                  properties: {
                    timeMin: {
                      type: 'string',
                      description: 'Start date/time in ISO format (e.g., 2024-02-12T00:00:00Z)',
                    },
                    timeMax: {
                      type: 'string',
                      description: 'End date/time in ISO format (e.g., 2024-02-13T00:00:00Z)',
                    },
                    maxResults: {
                      type: 'number',
                      description: 'Maximum number of events to return (optional, default: 50)',
                    },
                  },
                },
              },
              {
                name: 'create_calendar_event',
                description: 'Create a new Google Calendar event. Video conferencing is automatically handled: if user has configured a personal Zoom link in settings, it will be used; otherwise falls back to Google Meet. Do NOT manually create Zoom meetings unless specifically requested.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'string',
                      description: 'Event title/summary',
                    },
                    start: {
                      type: 'string',
                      description: 'Start date/time in ISO format (e.g., 2024-02-12T14:00:00-08:00)',
                    },
                    end: {
                      type: 'string',
                      description: 'End date/time in ISO format (e.g., 2024-02-12T15:00:00-08:00)',
                    },
                    description: {
                      type: 'string',
                      description: 'Event description (optional)',
                    },
                    location: {
                      type: 'string',
                      description: 'Event location or Zoom link (optional)',
                    },
                    attendees: {
                      type: 'array',
                      description: 'List of attendee email addresses (optional)',
                      items: {
                        type: 'string'
                      }
                    },
                    zoom_link: {
                      type: 'string',
                      description: 'Zoom meeting join URL (optional). If provided, will be added to the event instead of Google Meet.',
                    },
                  },
                  required: ['summary', 'start', 'end'],
                },
              },
              {
                name: 'update_calendar_event',
                description: 'Update an existing Google Calendar event - ACTUALLY modifies the event (unlike Clockwise which creates proposals)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    eventId: {
                      type: 'string',
                      description: 'Event ID to update',
                    },
                    summary: {
                      type: 'string',
                      description: 'New event title (optional)',
                    },
                    start: {
                      type: 'string',
                      description: 'New start date/time in ISO format (optional)',
                    },
                    end: {
                      type: 'string',
                      description: 'New end date/time in ISO format (optional)',
                    },
                    description: {
                      type: 'string',
                      description: 'New event description (optional)',
                    },
                    location: {
                      type: 'string',
                      description: 'New event location (optional)',
                    },
                  },
                  required: ['eventId'],
                },
              },
              {
                name: 'delete_calendar_event',
                description: 'Delete a Google Calendar event',
                inputSchema: {
                  type: 'object',
                  properties: {
                    eventId: {
                      type: 'string',
                      description: 'Event ID to delete',
                    },
                  },
                  required: ['eventId'],
                },
              },
              {
                name: 'search_contacts',
                description: 'Search for people by name across Google Contacts AND organization directory (all employees). Searches personal contacts, Gmail interactions, and Google Workspace directory. Returns email addresses with organization info.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'Name to search for (e.g., "Chethana", "John Smith")',
                    },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'create_zoom_meeting',
                description: 'Create a Zoom meeting and get the join URL. ALWAYS call this BEFORE creating a calendar event. Returns the Zoom join URL which MUST be passed to create_calendar_event as the zoom_link parameter.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    topic: {
                      type: 'string',
                      description: 'Meeting topic/title (e.g., "1:1 with Chethana")',
                    },
                    start_time: {
                      type: 'string',
                      description: 'Start time in ISO 8601 format (e.g., "2024-02-12T14:00:00Z")',
                    },
                    duration: {
                      type: 'number',
                      description: 'Meeting duration in minutes (e.g., 30, 60)',
                    },
                    timezone: {
                      type: 'string',
                      description: 'Timezone (optional, e.g., "America/Los_Angeles", default: UTC)',
                    },
                  },
                  required: ['topic', 'start_time', 'duration'],
                },
              },
            ],
          });
          break;

        case 'tools/call':
          const result = await this.handleToolCall(params.name, params.arguments);
          this.sendResponse(id, result);
          break;

        default:
          this.sendError('method_not_found', `Unknown method: ${method}`, id);
      }
    } catch (error: any) {
      this.sendError('internal_error', error.message, id);
    }
  }

  private async handleToolCall(toolName: string, args: any) {
    switch (toolName) {
      case 'create_task':
        return await this.createTask(args);

      case 'list_tasks':
        return await this.listTasks(args);

      case 'update_task':
        return await this.updateTask(args);

      case 'create_jira_ticket':
        return await this.createJiraTicket(args);

      case 'list_calendar_events':
        return await this.listCalendarEvents(args);

      case 'create_calendar_event':
        return await this.createCalendarEvent(args);

      case 'update_calendar_event':
        return await this.updateCalendarEvent(args);

      case 'delete_calendar_event':
        return await this.deleteCalendarEvent(args);

      case 'search_contacts':
        return await this.searchContacts(args);

      case 'create_zoom_meeting':
        return await this.createZoomMeeting(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async createTask(args: { title: string; priority?: string; deadline?: string }) {
    const storeData = readStore();
    const tasks = (storeData.tasks as Task[]) || [];

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: args.title,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'strategize',
      priority: (args.priority as any) || 'medium',
      deadline: args.deadline,
    };

    tasks.push(newTask);
    storeData.tasks = tasks;
    writeStore(storeData);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task created successfully!\n\nID: ${newTask.id}\nTitle: ${newTask.title}\nPriority: ${newTask.priority}\nDeadline: ${newTask.deadline || 'not set'}`,
        },
      ],
    };
  }

  private async listTasks(args: { completed?: boolean }) {
    const storeData = readStore();
    const tasks = (storeData.tasks as Task[]) || [];

    let filteredTasks = tasks;
    if (args.completed !== undefined) {
      filteredTasks = tasks.filter(t => t.completed === args.completed);
    }

    const taskList = filteredTasks
      .map((t, i) => `${i + 1}. ${t.completed ? '✅' : '⬜'} ${t.title} (ID: ${t.id})`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: filteredTasks.length > 0
            ? `Found ${filteredTasks.length} task(s):\n\n${taskList}`
            : 'No tasks found',
        },
      ],
    };
  }

  private async updateTask(args: { id: string; completed?: boolean; title?: string }) {
    const storeData = readStore();
    const tasks = (storeData.tasks as Task[]) || [];
    const taskIndex = tasks.findIndex(t => t.id === args.id);

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${args.id}`);
    }

    if (args.completed !== undefined) {
      tasks[taskIndex].completed = args.completed;
      tasks[taskIndex].updatedAt = new Date().toISOString();
      if (args.completed) {
        tasks[taskIndex].completedAt = new Date().toISOString();
      } else {
        delete tasks[taskIndex].completedAt;
      }
    }

    if (args.title) {
      tasks[taskIndex].title = args.title;
      tasks[taskIndex].updatedAt = new Date().toISOString();
    }

    storeData.tasks = tasks;
    writeStore(storeData);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task updated successfully!\n\n${tasks[taskIndex].title}${args.completed !== undefined ? `\nStatus: ${args.completed ? 'Completed' : 'Incomplete'}` : ''}`,
        },
      ],
    };
  }

  private getGoogleCalendar() {
    const storeData = readStore();

    const accessToken = storeData.google_access_token;
    const refreshToken = storeData.google_refresh_token;
    const expiresAt = storeData.google_expires_at;

    if (!refreshToken) {
      throw new Error('Google Calendar is not connected. Please connect Google in PM-OS Settings.');
    }

    // Get client ID and secret from environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not found in environment variables');
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost'
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiresAt,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  private async listCalendarEvents(args: { timeMin?: string; timeMax?: string; maxResults?: number }) {
    const calendar = this.getGoogleCalendar();

    const timeMin = args.timeMin || new Date().toISOString();
    const timeMax = args.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults = args.maxResults || 50;

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const eventList = events.map((event, i) => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      return `${i + 1}. ${event.summary} (${start} - ${end})\n   ID: ${event.id}`;
    }).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: events.length > 0
            ? `Found ${events.length} event(s):\n\n${eventList}`
            : 'No events found in the specified time range',
        },
      ],
    };
  }

  private async createCalendarEvent(args: { summary: string; start: string; end: string; description?: string; location?: string; attendees?: string[]; zoom_link?: string }) {
    console.log('[MCP] ========== CREATE CALENDAR EVENT ==========');
    console.log('[MCP] Summary:', args.summary);
    console.log('[MCP] Zoom link provided:', args.zoom_link || 'NONE');
    console.log('[MCP] Attendees:', args.attendees);

    const calendar = this.getGoogleCalendar();
    let zoomLink = args.zoom_link;

    // Auto-create Zoom meeting if no zoom_link provided
    if (!zoomLink) {
      const storeData = readStore();
      const settings = storeData.userSettings as any;

      // First priority: Check for personal Zoom meeting link in settings
      if (settings?.zoomPersonalMeetingLink) {
        zoomLink = settings.zoomPersonalMeetingLink;
        console.log('[MCP] ✅ Using personal Zoom link from settings');
      } else {
        console.log('[MCP] No personal Zoom link - attempting to auto-create Zoom meeting');
        const zoomAccessToken = storeData.zoom_access_token;

        if (zoomAccessToken) {
          console.log('[MCP] Zoom is connected - creating meeting');
          try {
            // Calculate duration from start/end times
            const startTime = new Date(args.start);
            const endTime = new Date(args.end);
            const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

            // Create Zoom meeting
            const zoomResult = await this.createZoomMeeting({
              topic: args.summary,
              start_time: args.start,
              duration: durationMinutes,
            });

            // Extract Zoom link from the result
            const zoomText = zoomResult.content[0].text;
            const urlMatch = zoomText.match(/Join URL:\*\* (https:\/\/[^\s]+)/);
            if (urlMatch) {
              zoomLink = urlMatch[1];
              console.log('[MCP] ✅ Auto-created Zoom meeting:', zoomLink);
            }
          } catch (error: any) {
            console.log('[MCP] ⚠️ Failed to auto-create Zoom:', error.message);
          }
        } else {
          console.log('[MCP] ⚠️ Zoom not connected - falling back to Google Meet');
        }
      }
    }

    // Build description with Zoom link if we have one
    let description = args.description || '';
    if (zoomLink) {
      console.log('[MCP] ✅ Adding Zoom link to event description');
      description = `${description}\n\nJoin Zoom Meeting:\n${zoomLink}`.trim();
    }

    const event: any = {
      summary: args.summary,
      description: description,
      location: zoomLink || args.location,
      start: {
        dateTime: args.start,
      },
      end: {
        dateTime: args.end,
      },
    };

    // Only add Google Meet if we don't have Zoom
    if (!zoomLink) {
      console.log('[MCP] Using Google Meet as final fallback');
      event.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      };
    } else {
      console.log('[MCP] ✅ Using Zoom - skipping Google Meet');
    }

    // Add attendees if provided
    if (args.attendees && args.attendees.length > 0) {
      event.attendees = args.attendees.map(email => ({ email }));
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: args.zoom_link ? 0 : 1, // Only request conference data if using Google Meet
      sendUpdates: 'all',
    });

    const createdEvent = response.data;
    const attendeesList = createdEvent.attendees
      ? `\nAttendees: ${createdEvent.attendees.map(a => a.email).join(', ')}`
      : '';

    // Extract video link (either Zoom or Google Meet)
    let videoLink = zoomLink; // Use the zoomLink we determined earlier (from settings, API, or not set)
    if (!videoLink) {
      videoLink = createdEvent.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === 'video'
      )?.uri || '';
    }
    const meetInfo = videoLink ? `\n🎥 Video Link: ${videoLink}` : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Calendar event created successfully!\n\nTitle: ${createdEvent.summary}\nStart: ${createdEvent.start?.dateTime}\nEnd: ${createdEvent.end?.dateTime}${attendeesList}${meetInfo}\nEvent ID: ${createdEvent.id}\nLink: ${createdEvent.htmlLink}`,
        },
      ],
    };
  }

  private async updateCalendarEvent(args: { eventId: string; summary?: string; start?: string; end?: string; description?: string; location?: string }) {
    const calendar = this.getGoogleCalendar();

    // First, get the existing event
    const existing = await calendar.events.get({
      calendarId: 'primary',
      eventId: args.eventId,
    });

    const existingEvent = existing.data;

    // Build the update object
    const updates: any = {
      summary: args.summary || existingEvent.summary,
      description: args.description !== undefined ? args.description : existingEvent.description,
      location: args.location !== undefined ? args.location : existingEvent.location,
      start: args.start ? { dateTime: args.start } : existingEvent.start,
      end: args.end ? { dateTime: args.end } : existingEvent.end,
    };

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: args.eventId,
      requestBody: updates,
    });

    const updatedEvent = response.data;

    return {
      content: [
        {
          type: 'text',
          text: `✅ Calendar event updated successfully!\n\nTitle: ${updatedEvent.summary}\nStart: ${updatedEvent.start?.dateTime}\nEnd: ${updatedEvent.end?.dateTime}\nEvent ID: ${updatedEvent.id}\nLink: ${updatedEvent.htmlLink}`,
        },
      ],
    };
  }

  private async deleteCalendarEvent(args: { eventId: string }) {
    const calendar = this.getGoogleCalendar();

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: args.eventId,
    });

    return {
      content: [
        {
          type: 'text',
          text: `✅ Calendar event deleted successfully!\n\nEvent ID: ${args.eventId}`,
        },
      ],
    };
  }

  // Simple string similarity using Levenshtein distance (unused but kept for future use)
  // @ts-ignore - kept for potential future use
  private stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Perfect match
    if (s1 === s2) return 1.0;

    // Contains match (high score)
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  private async searchContacts(args: { query: string }) {
    try {
      const storeData = readStore();

      const accessToken = storeData.google_access_token;
      const refreshToken = storeData.google_refresh_token;
      const expiresAt = storeData.google_expires_at;

      if (!refreshToken) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Google Contacts not available. Please ask the user for ${args.query}'s email address directly.`,
            },
          ],
        };
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Google OAuth not configured. Please ask the user for ${args.query}'s email address directly.`,
            },
          ],
        };
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: expiresAt,
      });

      const people = google.people({ version: 'v1', auth: oauth2Client });

      // Use Google People API to search both personal contacts AND organization directory
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Contact search timeout')), 5000)
      );

      // Search in parallel: personal contacts + organization directory
      const searchPromises = [
        // Personal contacts (and "other contacts" from Gmail interactions)
        people.people.searchContacts({
          query: args.query,
          readMask: 'names,emailAddresses,organizations',
          pageSize: 10,
        }).catch(() => ({ data: { results: [] } })),

        // Organization directory (Google Workspace employees)
        people.people.searchDirectoryPeople({
          query: args.query,
          readMask: 'names,emailAddresses,organizations',
          pageSize: 10,
          sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
        }).catch(() => ({ data: { people: [] } })),
      ];

      const [contactsResponse, directoryResponse] = await Promise.race([
        Promise.all(searchPromises),
        timeoutPromise
      ]) as any;

      // Combine results from both sources
      const contactResults = contactsResponse.data.results || [];
      const directoryResults = directoryResponse.data.people || [];

      // Convert directory results to match contacts format
      const allResults = [
        ...contactResults,
        ...directoryResults.map((person: any) => ({ person }))
      ];

      const results = allResults;

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `I couldn't find "${args.query}" in your Google Contacts or Slack workspace. Could you provide ${args.query}'s email address so I can create the meeting for you?`,
            },
          ],
        };
      }

      // Extract matches with email addresses
      const matches = results
        .map((result: any) => {
          const person = result.person;
          const displayName = person.names?.[0]?.displayName || '';
          const email = person.emailAddresses?.[0]?.value || '';
          const organization = person.organizations?.[0]?.name || '';

          if (!email) return null; // Skip contacts without email

          return {
            name: displayName,
            email,
            organization,
          };
        })
        .filter((match: any) => match !== null);

      if (matches.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `I couldn't find "${args.query}" in your Google Contacts or Slack workspace. Could you provide ${args.query}'s email address so I can create the meeting for you?`,
            },
          ],
        };
      }

      // If single match, provide it directly
      if (matches.length === 1) {
        const match = matches[0];
        if (!match) {
          throw new Error('Unexpected: matches array has length 1 but first element is undefined');
        }
        const orgInfo = match.organization ? ` (${match.organization})` : '';
        return {
          content: [
            {
              type: 'text',
              text: `Found contact: **${match.name}**${orgInfo} - ${match.email}\n\nUse this email address for the meeting invite.`,
            },
          ],
        };
      }

      // Multiple matches - let Claude choose or ask user
      const contactList = matches.map((match: any, index: number) => {
        const orgInfo = match.organization ? ` (${match.organization})` : '';
        return `${index + 1}. **${match.name}**${orgInfo}: ${match.email}`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${matches.length} contacts matching "${args.query}":\n\n${contactList}\n\nUse the most relevant email address, or ask the user which one they meant.`,
          },
        ],
      };
    } catch (error: any) {
      // Fail gracefully - contacts API might not have proper OAuth scope
      console.error('[MCP] Contact search failed:', error.message);
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Unable to search contacts (${error.message}). Please ask the user for ${args.query}'s email address directly.`,
          },
        ],
      };
    }
  }

  private async createZoomMeeting(args: { topic: string; start_time: string; duration: number; timezone?: string }) {
    console.log('[MCP] ========== CREATE ZOOM MEETING ==========');
    console.log('[MCP] Topic:', args.topic);
    console.log('[MCP] Start time:', args.start_time);
    console.log('[MCP] Duration:', args.duration);

    const storeData = readStore();
    const accessToken = storeData.zoom_access_token;

    console.log('[MCP] Zoom access token exists:', !!accessToken);

    if (!accessToken) {
      console.log('[MCP] ❌ No Zoom token - returning error');
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ Zoom is not connected. Please connect Zoom in PM-OS settings first.',
          },
        ],
      };
    }

    try {
      console.log('[MCP] Making Zoom API request...');
      const response = await httpRequest('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: args.topic,
          type: 2, // Scheduled meeting
          start_time: args.start_time,
          duration: args.duration,
          timezone: args.timezone || 'UTC',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: true,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Zoom API error: ${response.status} - ${errorData}`);
      }

      const meeting = await response.json();

      console.log('[MCP] ✅ Zoom meeting created!');
      console.log('[MCP] Join URL:', meeting.join_url);
      console.log('[MCP] Meeting ID:', meeting.id);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Zoom meeting created successfully!\n\n**Topic:** ${meeting.topic}\n**Join URL:** ${meeting.join_url}\n**Meeting ID:** ${meeting.id}\n**Password:** ${meeting.password || 'none'}\n\n⚠️ IMPORTANT: Use this join URL when creating the calendar event by passing it as the zoom_link parameter.`,
          },
        ],
      };
    } catch (error: any) {
      console.error('[MCP] ❌ Zoom meeting creation failed:', error);
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Failed to create Zoom meeting: ${error.message}`,
          },
        ],
      };
    }
  }

  private async createJiraTicket(args: { summary: string; description?: string; projectKey?: string; issueType?: string }) {
    const storeData = readStore();
    const settings = storeData.userSettings as any;

    if (!settings?.jiraEnabled || !settings?.jiraDomain || !settings?.jiraEmail || !settings?.jiraApiToken) {
      throw new Error('Jira is not configured in PM-OS settings');
    }

    const projectKey = args.projectKey || settings.jiraDefaultProject || 'PROJ';
    const issueType = args.issueType || settings.jiraDefaultIssueType || 'Task';

    const auth = Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString('base64');

    const response = await httpRequest(`https://${settings.jiraDomain}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: {
            key: projectKey,
          },
          summary: args.summary,
          description: args.description ? {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: args.description,
                  },
                ],
              },
            ],
          } : undefined,
          issuetype: {
            name: issueType,
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Jira ticket: ${error}`);
    }

    const data = await response.json() as any;
    const ticketUrl = `https://${settings.jiraDomain}/browse/${data.key}`;

    return {
      content: [
        {
          type: 'text',
          text: `✅ Jira ticket created successfully!\n\nTicket: ${data.key}\nURL: ${ticketUrl}\nSummary: ${args.summary}`,
        },
      ],
    };
  }

  private sendResponse(id: number | string, result: any) {
    const response = {
      jsonrpc: '2.0',
      id,
      result,
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  private sendError(code: string, message: string, id?: number | string) {
    const response = {
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code,
        message,
      },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

// Start the server
new PMOSMCPServer();

// Keep the process alive
process.stdin.on('end', () => {
  process.exit(0);
});
