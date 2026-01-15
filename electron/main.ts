import { app, BrowserWindow, globalShortcut, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import type { WindowPosition, Task } from '../src/types/task';
import { IntegrationManager } from './integration-manager';
import { JiraService } from '../src/services/jira';

// Load environment variables
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
let mainWindow: BrowserWindow | null = null;
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 600;

// Initialize integration manager
const integrationManager = new IntegrationManager(
  process.env.GOOGLE_CLIENT_ID || '',
  process.env.GOOGLE_CLIENT_SECRET || '',
  process.env.SLACK_CLIENT_ID || '',
  process.env.SLACK_CLIENT_SECRET || '',
  process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'
);

// Initialize Jira service if configured
let jiraService: JiraService | null = null;
if (process.env.JIRA_DOMAIN && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
  jiraService = new JiraService({
    domain: process.env.JIRA_DOMAIN,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Get saved position or default to right side of screen
  const savedPosition = store.get('windowPosition') as WindowPosition | undefined;
  const defaultX = screenWidth - WINDOW_WIDTH - 20;
  const defaultY = 100;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: savedPosition?.x ?? defaultX,
    y: savedPosition?.y ?? defaultY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In development, load from dev server; in production, load from file
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in development
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Hide instead of close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Save position when window is moved
  mainWindow.on('moved', () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      const position = store.get('windowPosition') as WindowPosition | undefined;
      store.set('windowPosition', {
        ...position,
        x,
        y,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
      });
    }
  });

  // Hide window when it loses focus (optional, can be toggled)
  mainWindow.on('blur', () => {
    const hideOnBlur = store.get('hideOnBlur', false);
    if (hideOnBlur && mainWindow) {
      mainWindow.hide();
    }
  });
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerHotkey() {
  const hotkey = store.get('hotkey', 'CommandOrControl+Shift+Space') as string;

  const success = globalShortcut.register(hotkey, () => {
    toggleWindow();
  });

  if (!success) {
    console.error('Failed to register global shortcut:', hotkey);
  }
}

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  registerHotkey();

  // Initialize integrations with stored tokens
  await integrationManager.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// IPC Handlers
ipcMain.handle('toggle-window', () => {
  toggleWindow();
});

ipcMain.handle('pin-window', (_event, isPinned: boolean) => {
  if (!mainWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  if (isPinned) {
    // Pin to right side
    const x = screenWidth - WINDOW_WIDTH - 20;
    const y = 100;
    mainWindow.setPosition(x, y);
  }

  const position = store.get('windowPosition') as WindowPosition | undefined;
  store.set('windowPosition', {
    ...position,
    isPinned,
    x: mainWindow.getPosition()[0],
    y: mainWindow.getPosition()[1],
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
});

ipcMain.handle('get-settings', () => {
  return {
    hotkey: store.get('hotkey', 'CommandOrControl+Shift+Space'),
    syncInterval: store.get('syncInterval', 5),
    windowPosition: store.get('windowPosition'),
    hideOnBlur: store.get('hideOnBlur', false),
  };
});

ipcMain.handle('update-settings', (_event, settings: any) => {
  Object.keys(settings).forEach(key => {
    store.set(key, settings[key]);
  });

  // If hotkey changed, re-register
  if (settings.hotkey) {
    globalShortcut.unregisterAll();
    registerHotkey();
  }
});

// Task Management IPC Handlers
ipcMain.handle('get-tasks', () => {
  const tasks = store.get('tasks', []) as Task[];
  return tasks;
});

ipcMain.handle('add-task', (_event, task: Partial<Task>) => {
  const tasks = store.get('tasks', []) as Task[];
  const now = new Date().toISOString();
  const newTask: Task = {
    id: randomUUID(),
    title: task.title || '',
    completed: task.completed || false,
    source: task.source || 'manual',
    sourceId: task.sourceId,
    dueDate: task.dueDate,
    priority: task.priority || 'medium',
    context: task.context,
    createdAt: task.createdAt || now,
    updatedAt: now,
  };

  tasks.unshift(newTask);
  store.set('tasks', tasks);
  return newTask;
});

ipcMain.handle('update-task', (_event, id: string, updates: Partial<Task>) => {
  const tasks = store.get('tasks', []) as Task[];
  const taskIndex = tasks.findIndex(t => t.id === id);

  if (taskIndex !== -1) {
    tasks[taskIndex] = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    store.set('tasks', tasks);
  }
});

ipcMain.handle('delete-task', (_event, id: string) => {
  const tasks = store.get('tasks', []) as Task[];
  const filteredTasks = tasks.filter(t => t.id !== id);
  store.set('tasks', filteredTasks);
});

// OAuth Handlers
ipcMain.handle('start-oauth', async (_event, provider: 'google' | 'slack') => {
  return new Promise((resolve, reject) => {
    let authWindow: BrowserWindow | null = new BrowserWindow({
      width: 500,
      height: 600,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const authUrls = {
      google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'}&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly%20https://www.googleapis.com/auth/gmail.readonly&access_type=offline&prompt=consent`,
      slack: `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&scope=channels:read,chat:write,users:read,im:read&redirect_uri=${process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'}`,
    };

    authWindow.loadURL(authUrls[provider]);

    // Listen for redirect
    authWindow.webContents.on('will-redirect', async (_event, url) => {
      if (url.startsWith(process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback')) {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');

        if (code) {
          try {
            // Exchange code for tokens using integration manager
            if (provider === 'google') {
              await integrationManager.connectGoogle(code);
            } else if (provider === 'slack') {
              await integrationManager.connectSlack(code);
            }
            resolve({ code, provider, success: true });
          } catch (error) {
            console.error(`Failed to exchange ${provider} code:`, error);
            resolve({ code, provider, success: false, error });
          }
          authWindow?.close();
        }
      }
    });

    authWindow.on('closed', () => {
      authWindow = null;
      reject(new Error('OAuth window closed'));
    });
  });
});

ipcMain.handle('get-oauth-tokens', (_event, provider: string) => {
  return {
    accessToken: store.get(`${provider}_access_token`),
    refreshToken: store.get(`${provider}_refresh_token`),
    expiresAt: store.get(`${provider}_expires_at`),
  };
});

ipcMain.handle('save-oauth-tokens', (_event, provider: string, tokens: any) => {
  store.set(`${provider}_access_token`, tokens.accessToken);
  if (tokens.refreshToken) {
    store.set(`${provider}_refresh_token`, tokens.refreshToken);
  }
  if (tokens.expiresAt) {
    store.set(`${provider}_expires_at`, tokens.expiresAt);
  }
});

// Integration sync handlers
ipcMain.handle('sync-calendar', async () => {
  try {
    return await integrationManager.syncCalendar();
  } catch (error: any) {
    console.error('Failed to sync calendar:', error);
    return [];
  }
});

ipcMain.handle('sync-gmail', async () => {
  try {
    return await integrationManager.syncGmail();
  } catch (error: any) {
    console.error('Failed to sync Gmail:', error);
    return [];
  }
});

ipcMain.handle('sync-slack', async () => {
  try {
    return await integrationManager.syncSlack();
  } catch (error: any) {
    console.error('Failed to sync Slack:', error);
    return [];
  }
});

// Smart Suggestions
ipcMain.handle('get-smart-suggestions', async () => {
  try {
    return await integrationManager.getSmartSuggestions();
  } catch (error: any) {
    console.error('Failed to get smart suggestions:', error);
    return [];
  }
});

// Jira Integration Handlers
ipcMain.handle('jira-test-connection', async () => {
  if (!jiraService) {
    return { success: false, error: 'Jira not configured' };
  }

  try {
    const isConnected = await jiraService.testConnection();
    return { success: isConnected };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('jira-get-projects', async () => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getProjects();
});

ipcMain.handle('jira-get-issue-types', async (_event, projectKey: string) => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getIssueTypes(projectKey);
});

ipcMain.handle('jira-create-issue', async (_event, request: any) => {
  if (!jiraService) throw new Error('Jira not configured');

  const issue = await jiraService.createIssue({
    summary: request.summary,
    description: request.description,
    projectKey: request.projectKey || process.env.JIRA_DEFAULT_PROJECT || '',
    issueType: request.issueType || process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task',
    priority: request.priority,
  });

  return {
    key: issue.key,
    url: jiraService.getIssueUrl(issue.key),
  };
});

ipcMain.handle('jira-get-my-issues', async () => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getMyIssues();
});

ipcMain.handle('jira-is-configured', () => {
  return !!jiraService;
});
