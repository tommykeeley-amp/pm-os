import { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import type { WindowPosition, Task } from '../src/types/task';
import { IntegrationManager } from './integration-manager';
import { JiraService } from '../src/services/jira';
import { ConfluenceService } from '../src/services/confluence';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - handle both dev and production paths
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', '.env')
  : path.join(__dirname, '..', '.env');

console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Debug: Log OAuth credentials (first 20 chars only for security)
console.log('=== OAuth Configuration Debug ===');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET?.substring(0, 10) + '...');
console.log('OAUTH_REDIRECT_URI:', process.env.OAUTH_REDIRECT_URI);
console.log('================================');

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

// Helper function to get Jira/Confluence credentials from settings or env
function getJiraCredentials() {
  const userSettings = store.get('userSettings', {}) as any;
  return {
    domain: userSettings.jiraDomain || process.env.JIRA_DOMAIN,
    email: userSettings.jiraEmail || process.env.JIRA_EMAIL,
    apiToken: userSettings.jiraApiToken || process.env.JIRA_API_TOKEN,
  };
}

// Initialize Jira service if configured
let jiraService: JiraService | null = null;
const jiraCredentials = getJiraCredentials();
if (jiraCredentials.domain && jiraCredentials.email && jiraCredentials.apiToken) {
  jiraService = new JiraService({
    domain: jiraCredentials.domain,
    email: jiraCredentials.email,
    apiToken: jiraCredentials.apiToken,
  });
}

// Initialize Confluence service if configured (uses same credentials as Jira)
let confluenceService: ConfluenceService | null = null;
if (jiraCredentials.domain && jiraCredentials.email && jiraCredentials.apiToken) {
  confluenceService = new ConfluenceService({
    domain: jiraCredentials.domain,
    email: jiraCredentials.email,
    apiToken: jiraCredentials.apiToken,
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Get saved position or default to right side of screen
  const savedPosition = store.get('windowPosition') as WindowPosition | undefined;
  const isPinned = savedPosition?.isPinned ?? false;

  // If pinned, use full height on right side; otherwise use default dimensions
  const windowWidth = WINDOW_WIDTH;
  const windowHeight = isPinned ? screenHeight : WINDOW_HEIGHT;
  const defaultX = isPinned ? screenWidth - WINDOW_WIDTH : screenWidth - WINDOW_WIDTH - 20;
  const defaultY = isPinned ? 0 : 100;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: savedPosition?.x ?? defaultX,
    y: savedPosition?.y ?? defaultY,
    title: 'PM OS',
    icon: path.join(__dirname, '../build/icon.png'),
    frame: false,
    transparent: true,
    alwaysOnTop: isPinned, // Only always-on-top when pinned
    skipTaskbar: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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

  // Register cmd+shift+p to show window and focus task input
  // Try to unregister first in case it's already registered
  globalShortcut.unregister('CommandOrControl+Shift+P');

  const quickAddSuccess = globalShortcut.register('CommandOrControl+Shift+P', () => {
    console.log('Quick add hotkey triggered!');

    if (!mainWindow) {
      createWindow();
      // Wait for window to be ready before sending focus event
      setTimeout(() => {
        if (mainWindow) {
          console.log('Sending focus event after window creation');
          mainWindow.webContents.send('focus-task-input');
        }
      }, 500);
    } else {
      // Aggressively show and focus the window
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      // Multiple methods to ensure focus on macOS
      mainWindow.moveTop();
      mainWindow.focus();
      app.focus({ steal: true });

      // Send focus event after ensuring window is focused
      setTimeout(() => {
        if (mainWindow && mainWindow.webContents) {
          console.log('Sending focus event to renderer');
          mainWindow.webContents.send('focus-task-input');
        }
      }, 150);
    }
  });

  if (!quickAddSuccess) {
    console.error('Failed to register quick add shortcut: CommandOrControl+Shift+P');
    console.error('This might be because another application is using this shortcut.');
  } else {
    console.log('Successfully registered cmd+shift+p shortcut');
  }
}

// App lifecycle
app.whenReady().then(async () => {
  app.setName('PM OS');
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
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  if (isPinned) {
    // Pin to right side with full height
    const x = screenWidth - WINDOW_WIDTH;
    const y = 0;
    mainWindow.setResizable(true);
    mainWindow.setBounds({
      x,
      y,
      width: WINDOW_WIDTH,
      height: screenHeight
    });
    mainWindow.setResizable(false);
    mainWindow.setAlwaysOnTop(true); // Enable always-on-top when pinned
  } else {
    // Unpin - restore original size and center
    mainWindow.setResizable(true);
    mainWindow.setBounds({
      x: Math.floor((screenWidth - WINDOW_WIDTH) / 2),
      y: Math.floor((screenHeight - WINDOW_HEIGHT) / 2),
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    });
    mainWindow.setResizable(false);
    mainWindow.setAlwaysOnTop(false); // Disable always-on-top when unpinned
  }

  const position = store.get('windowPosition') as WindowPosition | undefined;
  store.set('windowPosition', {
    ...position,
    isPinned,
    x: mainWindow.getPosition()[0],
    y: mainWindow.getPosition()[1],
    width: mainWindow.getSize()[0],
    height: mainWindow.getSize()[1],
  });
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
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

// User Settings IPC Handlers
ipcMain.handle('get-user-settings', () => {
  return store.get('userSettings', {});
});

ipcMain.handle('save-user-settings', (_event, settings: any) => {
  store.set('userSettings', settings);

  // If Jira/Confluence credentials changed, reinitialize services
  if (settings.jiraDomain || settings.jiraEmail || settings.jiraApiToken) {
    // Reinitialize Jira service
    if (settings.jiraDomain && settings.jiraEmail && settings.jiraApiToken) {
      jiraService = new JiraService({
        domain: settings.jiraDomain,
        email: settings.jiraEmail,
        apiToken: settings.jiraApiToken,
      });

      // Also reinitialize Confluence service (uses same credentials)
      confluenceService = new ConfluenceService({
        domain: settings.jiraDomain,
        email: settings.jiraEmail,
        apiToken: settings.jiraApiToken,
      });
    }
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
        // Add additional preferences to mimic a real browser
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    // Set user agent to appear as the latest Chrome browser
    // Updated to Chrome 131 (current as of Jan 2026)
    authWindow.webContents.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Set additional session properties to appear more like a real browser
    authWindow.webContents.session.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const authUrls = {
      google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'}&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly%20https://www.googleapis.com/auth/gmail.readonly&access_type=offline&prompt=consent`,
      slack: `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&scope=channels:read,chat:write,users:read,im:read&redirect_uri=${process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'}`,
    };

    authWindow.loadURL(authUrls[provider]);

    // Handle OAuth callback
    const handleOAuthCallback = async (url: string) => {
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
    };

    // Listen for redirect - handle both will-redirect and did-navigate
    authWindow.webContents.on('will-redirect', async (_event, url) => {
      await handleOAuthCallback(url);
    });

    authWindow.webContents.on('did-navigate', async (_event, url) => {
      await handleOAuthCallback(url);
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

  const userSettings = store.get('userSettings', {}) as any;
  const issue = await jiraService.createIssue({
    summary: request.summary,
    description: request.description,
    projectKey: request.projectKey || userSettings.jiraDefaultProject || process.env.JIRA_DEFAULT_PROJECT || '',
    issueType: request.issueType || userSettings.jiraDefaultIssueType || process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task',
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

// Confluence Handlers
ipcMain.handle('confluence-is-configured', () => {
  return !!confluenceService;
});

ipcMain.handle('confluence-test-connection', async () => {
  if (!confluenceService) {
    return { success: false, error: 'Confluence not configured' };
  }
  return await confluenceService.testConnection();
});

ipcMain.handle('confluence-get-spaces', async () => {
  if (!confluenceService) throw new Error('Confluence not configured');
  return await confluenceService.getSpaces();
});

ipcMain.handle('confluence-create-page', async (_event, request: any) => {
  if (!confluenceService) throw new Error('Confluence not configured');

  const userSettings = store.get('userSettings', {}) as any;
  const page = await confluenceService.createPage({
    title: request.title,
    body: request.body,
    spaceKey: request.spaceKey || userSettings.confluenceDefaultSpace || process.env.CONFLUENCE_DEFAULT_SPACE || '',
    parentId: request.parentId || userSettings.confluenceDefaultParentId || process.env.CONFLUENCE_DEFAULT_PARENT_ID,
  });

  return {
    id: page.id,
    url: page.url,
  };
});

ipcMain.handle('confluence-search-pages', async (_event, query: string, spaceKey?: string) => {
  if (!confluenceService) throw new Error('Confluence not configured');
  return await confluenceService.searchPages(query, spaceKey);
});

ipcMain.handle('confluence-get-page', async (_event, pageId: string) => {
  if (!confluenceService) throw new Error('Confluence not configured');
  return await confluenceService.getPage(pageId);
});
