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
                description: 'Create a new Google Calendar event',
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
                      description: 'Event location (optional)',
                    },
                    attendees: {
                      type: 'array',
                      description: 'List of attendee email addresses (optional)',
                      items: {
                        type: 'string'
                      }
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
                description: 'Search Google Contacts by name to find email addresses for calendar invites',
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

  private async createCalendarEvent(args: { summary: string; start: string; end: string; description?: string; location?: string; attendees?: string[] }) {
    const calendar = this.getGoogleCalendar();

    const event: any = {
      summary: args.summary,
      description: args.description,
      location: args.location,
      start: {
        dateTime: args.start,
      },
      end: {
        dateTime: args.end,
      },
    };

    // Add attendees if provided
    if (args.attendees && args.attendees.length > 0) {
      event.attendees = args.attendees.map(email => ({ email }));
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all', // Send email invites to attendees
    });

    const createdEvent = response.data;
    const attendeesList = createdEvent.attendees
      ? `\nAttendees: ${createdEvent.attendees.map(a => a.email).join(', ')}`
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Calendar event created successfully!\n\nTitle: ${createdEvent.summary}\nStart: ${createdEvent.start?.dateTime}\nEnd: ${createdEvent.end?.dateTime}${attendeesList}\nEvent ID: ${createdEvent.id}\nLink: ${createdEvent.htmlLink}`,
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

      // Search contacts with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Contact search timeout')), 3000)
      );

      const searchPromise = people.people.searchContacts({
        query: args.query,
        readMask: 'names,emailAddresses',
      });

      const response = await Promise.race([searchPromise, timeoutPromise]) as any;

      const contacts = response.data.results || [];

      if (contacts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No contacts found matching "${args.query}". Please ask the user for their email address.`,
            },
          ],
        };
      }

      const contactList = contacts.map((result: any) => {
        const person = result.person;
        const name = person.names?.[0]?.displayName || 'Unknown';
        const email = person.emailAddresses?.[0]?.value || 'No email';
        return `• **${name}**: ${email}`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${contacts.length} contact(s) matching "${args.query}":\n\n${contactList}`,
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
