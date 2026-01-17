import { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import type { WindowPosition, Task } from '../src/types/task';
import { IntegrationManager } from './integration-manager';
import { JiraService } from '../src/services/jira';
import { ConfluenceService } from '../src/services/confluence';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up file logging
const logFile = '/tmp/pm-os-oauth-debug.log';
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args: any[]) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
  logStream.write(`${message}\n`);
  originalConsoleLog(...args);
};

console.error = (...args: any[]) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
  logStream.write(`ERROR: ${message}\n`);
  originalConsoleError(...args);
};

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
  process.env.ZOOM_CLIENT_ID || '',
  process.env.ZOOM_CLIENT_SECRET || '',
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
    if (!(app as any).isQuitting) {
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

  // Helper function to show window and switch tab
  const showWindowAndSwitchTab = (tab: 'tasks' | 'meetings' | 'chats', focusInput = false) => {
    if (!mainWindow) {
      createWindow();
      // Wait for window to be ready before sending event
      setTimeout(() => {
        if (mainWindow) {
          console.log(`Switching to ${tab} tab after window creation`);
          mainWindow.webContents.send('switch-tab', tab);
          if (focusInput) {
            mainWindow.webContents.send('focus-task-input');
          }
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

      // Send switch tab event after ensuring window is focused
      setTimeout(() => {
        if (mainWindow && mainWindow.webContents) {
          console.log(`Switching to ${tab} tab`);
          mainWindow.webContents.send('switch-tab', tab);
          if (focusInput) {
            mainWindow.webContents.send('focus-task-input');
          }
        }
      }, 150);
    }
  };

  // Register cmd+shift+t to show window and switch to tasks tab
  globalShortcut.unregister('CommandOrControl+Shift+T');
  const tasksSuccess = globalShortcut.register('CommandOrControl+Shift+T', () => {
    console.log('Tasks hotkey triggered!');
    showWindowAndSwitchTab('tasks', true);
  });

  if (!tasksSuccess) {
    console.error('Failed to register tasks shortcut: CommandOrControl+Shift+T');
  } else {
    console.log('Successfully registered cmd+shift+t shortcut');
  }

  // Register cmd+shift+m to show window and switch to meetings tab
  globalShortcut.unregister('CommandOrControl+Shift+M');
  const meetingsSuccess = globalShortcut.register('CommandOrControl+Shift+M', () => {
    console.log('Meetings hotkey triggered!');
    showWindowAndSwitchTab('meetings');
  });

  if (!meetingsSuccess) {
    console.error('Failed to register meetings shortcut: CommandOrControl+Shift+M');
  } else {
    console.log('Successfully registered cmd+shift+m shortcut');
  }

  // Register cmd+shift+c to show window and switch to chats tab
  globalShortcut.unregister('CommandOrControl+Shift+C');
  const chatsSuccess = globalShortcut.register('CommandOrControl+Shift+C', () => {
    console.log('Chats hotkey triggered!');
    showWindowAndSwitchTab('chats');
  });

  if (!chatsSuccess) {
    console.error('Failed to register chats shortcut: CommandOrControl+Shift+C');
  } else {
    console.log('Successfully registered cmd+shift+c shortcut');
  }
}

// App lifecycle
// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('pmos', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('pmos');
}

// Handle custom protocol URLs (macOS)
app.on('open-url', (event, url) => {
  console.log('[Protocol] open-url event triggered:', url);
  event.preventDefault();
  handleProtocolUrl(url);
});

// Handle custom protocol URLs (Windows/Linux)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Protocol] Second instance detected, quitting...');
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    console.log('[Protocol] second-instance event triggered');
    console.log('[Protocol] commandLine:', commandLine);

    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle protocol URL from second instance
    const url = commandLine.find(arg => arg.startsWith('pmos://'));
    console.log('[Protocol] Found URL in commandLine:', url);
    if (url) {
      handleProtocolUrl(url);
    }
  });
}

// Function to handle protocol URLs
async function handleProtocolUrl(url: string) {
  console.log('[Protocol] Received URL:', url);

  try {
    const urlObj = new URL(url);
    const provider = urlObj.searchParams.get('provider');
    const sessionId = urlObj.searchParams.get('sessionId');

    console.log('[Protocol] Provider:', provider);
    console.log('[Protocol] Session ID:', sessionId ? 'received' : 'missing');

    if (!provider || !sessionId) {
      console.error('[Protocol] Missing provider or sessionId');
      return;
    }

    // Fetch tokens from Vercel using session ID
    console.log('[Protocol] Fetching tokens from Vercel...');
    const tokenResponse = await fetch(`https://pm-os.vercel.app/api/exchange-token?sessionId=${sessionId}`);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[Protocol] Failed to fetch tokens:', tokenData);
      throw new Error(tokenData.error || 'Failed to fetch tokens');
    }

    console.log('[Protocol] Tokens received from Vercel');
    const { tokens } = tokenData;

    // Save tokens directly to store
    if (provider === 'google') {
      const expiresAt = Date.now() + (tokens.expires_in * 1000);
      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      };

      store.set('google_access_token', tokenData.accessToken);
      if (tokenData.refreshToken) {
        store.set('google_refresh_token', tokenData.refreshToken);
      }
      store.set('google_expires_at', tokenData.expiresAt);
      store.set('google_oauth_scope_version', 2);

      console.log('[Protocol] Google tokens saved to store');

      // Initialize services
      await integrationManager.initialize();
      console.log('[Protocol] Google connection successful');
    } else if (provider === 'slack') {
      // Slack returns tokens in authed_user for user tokens
      const accessToken = tokens.authed_user?.access_token || tokens.access_token;

      if (accessToken) {
        store.set('slack_access_token', accessToken);
        if (tokens.authed_user?.refresh_token) {
          store.set('slack_refresh_token', tokens.authed_user.refresh_token);
        }
        if (tokens.authed_user?.expires_in) {
          store.set('slack_expires_at', Date.now() + (tokens.authed_user.expires_in * 1000));
        }
        console.log('[Protocol] Slack tokens saved to store');

        // Initialize services
        await integrationManager.initialize();
        console.log('[Protocol] Slack connection successful');
      } else {
        throw new Error('No access token found in Slack response');
      }
    }

    // Notify the renderer process
    if (mainWindow) {
      mainWindow.webContents.send('oauth-success', { provider });
    }
  } catch (error) {
    console.error('[Protocol] Failed to handle OAuth callback:', error);
    if (mainWindow) {
      mainWindow.webContents.send('oauth-error', { error: String(error) });
    }
  }
}

app.whenReady().then(async () => {
  app.setName('PM OS');
  createWindow();
  registerHotkey();

  // Initialize integrations with stored tokens
  console.log('[Main] About to initialize integrationManager...');
  await integrationManager.initialize();
  console.log('[Main] integrationManager initialization complete');

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
  (app as any).isQuitting = true;
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
ipcMain.handle('start-oauth', async (_event, provider: 'google' | 'slack' | 'zoom') => {
  // Encode provider in state parameter so callback knows which provider
  const state = Buffer.from(JSON.stringify({ provider })).toString('base64');

  const authUrls = {
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.OAUTH_REDIRECT_URI || '')}&response_type=code&scope=https://www.googleapis.com/auth/calendar%20https://www.googleapis.com/auth/gmail.readonly&access_type=offline&prompt=consent&state=${state}`,
    slack: `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&scope=channels:read,channels:history,groups:history,mpim:history,im:history,users:read,conversations.info&redirect_uri=${encodeURIComponent(process.env.OAUTH_REDIRECT_URI || '')}&state=${state}`,
    zoom: `https://zoom.us/oauth/authorize?client_id=${process.env.ZOOM_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.OAUTH_REDIRECT_URI || '')}&response_type=code&state=${state}`,
  };

  console.log(`[OAuth] Opening ${provider} auth URL in system browser`);
  console.log(`[OAuth] Redirect URI: ${process.env.OAUTH_REDIRECT_URI}`);

  // Open in system browser
  await shell.openExternal(authUrls[provider]);

  return { success: true };
});

ipcMain.handle('get-oauth-tokens', (_event, provider: string) => {
  const tokens = {
    accessToken: store.get(`${provider}_access_token`),
    refreshToken: store.get(`${provider}_refresh_token`),
    expiresAt: store.get(`${provider}_expires_at`),
  };
  console.log(`[IPC] get-oauth-tokens for ${provider}:`, {
    accessToken: tokens.accessToken ? `YES (length: ${(tokens.accessToken as string).length})` : 'NO',
    refreshToken: tokens.refreshToken ? 'YES' : 'NO',
    expiresAt: tokens.expiresAt
  });
  return tokens;
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

// RSVP handler
ipcMain.handle('calendar-update-rsvp', async (_event, eventId: string, status: string) => {
  try {
    await integrationManager.updateEventRSVP(eventId, status as 'accepted' | 'declined' | 'tentative');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to update RSVP:', error);
    return { success: false, error: error.message };
  }
});

// Event creation handler
ipcMain.handle('calendar-create-event', async (_event, request: any) => {
  try {
    const event = await integrationManager.createCalendarEvent(request);
    return { success: true, event };
  } catch (error: any) {
    console.error('Failed to create event:', error);
    return { success: false, error: error.message };
  }
});

// Zoom configuration check
ipcMain.handle('zoom-is-configured', async () => {
  return integrationManager.isZoomConfigured();
});

// Zoom meeting creation
ipcMain.handle('zoom-create-meeting', async (_event, request: any) => {
  try {
    const meeting = await integrationManager.createZoomMeeting(request);
    return { success: true, meeting };
  } catch (error: any) {
    console.error('Failed to create Zoom meeting:', error);
    return { success: false, error: error.message };
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

// Chats - Slack unread messages
ipcMain.handle('get-slack-unread-messages', async () => {
  try {
    return await integrationManager.getSlackUnreadMessages();
  } catch (error: any) {
    console.error('Failed to get Slack unread messages:', error);
    return [];
  }
});

// Chats - Starred emails
ipcMain.handle('get-starred-emails', async () => {
  try {
    return await integrationManager.getStarredEmails();
  } catch (error: any) {
    console.error('Failed to get starred emails:', error);
    return [];
  }
});

// Slack channels list
ipcMain.handle('get-slack-channels', async () => {
  try {
    return await integrationManager.getSlackChannels();
  } catch (error: any) {
    console.error('Failed to get Slack channels:', error);
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
