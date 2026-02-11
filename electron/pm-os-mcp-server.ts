#!/usr/bin/env node

/**
 * PM-OS MCP Server
 * Exposes PM-OS capabilities (tasks, Jira, etc.) as MCP tools for Claude Code
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

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
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
  source?: string;
  sourceId?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
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
                    text: {
                      type: 'string',
                      description: 'The task description',
                    },
                    priority: {
                      type: 'string',
                      enum: ['low', 'medium', 'high'],
                      description: 'Task priority (optional)',
                    },
                    dueDate: {
                      type: 'string',
                      description: 'Due date in ISO format (optional)',
                    },
                  },
                  required: ['text'],
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
                    text: {
                      type: 'string',
                      description: 'Update task text',
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

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async createTask(args: { text: string; priority?: string; dueDate?: string }) {
    const storeData = readStore();
    const tasks = (storeData.tasks as Task[]) || [];

    const newTask: Task = {
      id: `task-${Date.now()}`,
      text: args.text,
      completed: false,
      createdAt: new Date().toISOString(),
      source: 'strategize',
      priority: args.priority as any,
      dueDate: args.dueDate,
    };

    tasks.push(newTask);
    storeData.tasks = tasks;
    writeStore(storeData);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task created successfully!\n\nID: ${newTask.id}\nText: ${newTask.text}\nPriority: ${newTask.priority || 'none'}\nDue: ${newTask.dueDate || 'not set'}`,
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
      .map((t, i) => `${i + 1}. ${t.completed ? '✅' : '⬜'} ${t.text} (ID: ${t.id})`)
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

  private async updateTask(args: { id: string; completed?: boolean; text?: string }) {
    const storeData = readStore();
    const tasks = (storeData.tasks as Task[]) || [];
    const taskIndex = tasks.findIndex(t => t.id === args.id);

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${args.id}`);
    }

    if (args.completed !== undefined) {
      tasks[taskIndex].completed = args.completed;
      if (args.completed) {
        tasks[taskIndex].completedAt = new Date().toISOString();
      } else {
        delete tasks[taskIndex].completedAt;
      }
    }

    if (args.text) {
      tasks[taskIndex].text = args.text;
    }

    storeData.tasks = tasks;
    writeStore(storeData);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task updated successfully!\n\n${tasks[taskIndex].text}${args.completed !== undefined ? `\nStatus: ${args.completed ? 'Completed' : 'Incomplete'}` : ''}`,
        },
      ],
    };
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
