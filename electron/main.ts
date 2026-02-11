import { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import { spawn } from 'child_process';
import type { WindowPosition, Task } from '../src/types/task';
import { IntegrationManager } from './integration-manager';
import { JiraService } from '../src/services/jira';
import { ConfluenceService } from '../src/services/confluence';
import { SlackEventsServer } from './slack-events';
import { SlackDigestService } from './slack-digest-service';
import { MCPManager } from './mcp-manager';
import OpenAI from 'openai';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up file logging with safe error handling
const logFile = '/tmp/pm-os-mcp-debug.log';
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Safe logging that won't crash on EPIPE
const safeLog = (...args: any[]) => {
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return arg;
    }).join(' ');
    logStream.write(`[${timestamp}] ${message}\n`);
    originalConsoleLog(...args);
  } catch (error) {
    // Silently ignore logging errors to prevent EPIPE crashes
  }
};

const safeError = (...args: any[]) => {
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return arg;
    }).join(' ');
    logStream.write(`[${timestamp}] ERROR: ${message}\n`);
    originalConsoleError(...args);
  } catch (error) {
    // Silently ignore logging errors to prevent EPIPE crashes
  }
};

console.log = safeLog;
console.error = safeError;

// Log startup
console.log('\n\n========== PM-OS STARTING ==========');
console.log(`Log file: ${logFile}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log('=====================================\n');

// Load environment variables - handle both dev and production paths
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', '.env')
  : path.join(__dirname, '..', '.env');

console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Set app name (important for macOS dock and menu bar)
app.name = 'PM-OS';

// Debug: Log configuration
console.log('=== PM-OS Configuration ===');
console.log('NOTE: OAuth credentials are now server-side (Vercel)');
console.log('Local .env credentials are OPTIONAL (only for token refresh)');
console.log('GOOGLE_CLIENT_SECRET available:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('SLACK_CLIENT_SECRET available:', !!process.env.SLACK_CLIENT_SECRET);
console.log('OPENAI_API_KEY available:', !!process.env.OPENAI_API_KEY);
console.log('================================');

const store = new Store();
let mainWindow: BrowserWindow | null = null;
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 600;

// Claude Code session management
let claudeProcess: any = null;

// MCP OAuth callback server
let oauthCallbackServer: http.Server | null = null;
const OAUTH_CALLBACK_PORT = 3000; // Standard OAuth redirect port

function startOAuthCallbackServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (oauthCallbackServer) {
      resolve();
      return;
    }

    oauthCallbackServer = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${OAUTH_CALLBACK_PORT}`);

      // Handle both old-style (/oauth/callback/) and new MCP Manager style (/mcp/<name>/callback)
      if (url.pathname.startsWith('/oauth/callback/')) {
        const serverName = url.pathname.split('/')[3];
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        console.log(`[OAuth Server] Received callback for ${serverName}`);

        // Send success page
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Authorization Successful</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #4CAF50;">✓ Authorization Successful!</h1>
            <p>You can close this window and return to PM-OS.</p>
            <script>window.close();</script>
          </body>
          </html>
        `);

        // Notify main process
        if (code && mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('mcp-oauth-callback', { serverName, code, state });
        }

        // Store for later use
        store.set(`mcpOAuth.${serverName}.authCode`, code);
        store.set(`mcpOAuth.${serverName}.authState`, state);
      } else if (url.pathname.match(/^\/mcp\/[^/]+\/callback$/)) {
        // Handle MCP Manager OAuth callback (/mcp/<name>/callback)
        // Note: The actual OAuth window and token exchange is handled by the MCPManager
        // This just provides a success page for the browser to show
        console.log(`[OAuth Server] Received MCP Manager callback: ${url.pathname}`);

        // Send success page
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Authorization Successful</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #4CAF50;">✓ Authorization Successful!</h1>
            <p>Authentication complete! This window will close automatically.</p>
            <script>
              // Close window after a short delay
              setTimeout(() => window.close(), 1000);
            </script>
          </body>
          </html>
        `);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    oauthCallbackServer.listen(OAUTH_CALLBACK_PORT, 'localhost', () => {
      console.log(`[OAuth Server] Listening on http://localhost:${OAUTH_CALLBACK_PORT}`);
      resolve();
    });

    oauthCallbackServer.on('error', (err) => {
      console.error('[OAuth Server] Failed to start:', err);
      reject(err);
    });
  });
}

// Disabled: Old OAuth callback server stop function
// Now using MCPManager for custom OAuth flow
/*
function _stopOAuthCallbackServer(): void {
  if (oauthCallbackServer) {
    oauthCallbackServer.close();
    oauthCallbackServer = null;
    console.log('[OAuth Server] Stopped');
  }
}
*/

// Disabled: Old MCP SDK OAuth Provider
// Now using custom HTTPMCPClient with MCPManager
/*
class MCPOAuthProvider implements OAuthClientProvider {
  private serverName: string;
  private _codeVerifier?: string;

  constructor(serverName: string) {
    this.serverName = serverName;
  }

  get redirectUrl(): string {
    // Use localhost for Amplitude's default OAuth app
    return `http://localhost:${OAUTH_CALLBACK_PORT}/oauth/callback/${this.serverName}`;
  }

  get clientMetadata(): OAuthClientMetadata | undefined {
    // Return undefined - let MCP server provide its own OAuth configuration
    return undefined;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const stored = store.get(`mcpOAuth.${this.serverName}.clientInfo`) as OAuthClientInformationMixed | undefined;
    return stored;
  }

  saveClientInformation(clientInfo: OAuthClientInformationMixed): void {
    store.set(`mcpOAuth.${this.serverName}.clientInfo`, clientInfo);
    console.log(`[MCP OAuth] Saved client info for ${this.serverName}`);
  }

  tokens(): OAuthTokens | undefined {
    const stored = store.get(`mcpOAuth.${this.serverName}.tokens`) as OAuthTokens | undefined;
    return stored;
  }

  saveTokens(tokens: OAuthTokens): void {
    store.set(`mcpOAuth.${this.serverName}.tokens`, tokens);
    console.log(`[MCP OAuth] Saved tokens for ${this.serverName}`);
  }

  redirectToAuthorization(authUrl: URL): void {
    console.log(`[MCP OAuth] Opening authorization URL for ${this.serverName}:`, authUrl.toString());
    shell.openExternal(authUrl.toString());
  }

  saveCodeVerifier(verifier: string): void {
    this._codeVerifier = verifier;
    store.set(`mcpOAuth.${this.serverName}.codeVerifier`, verifier);
  }

  codeVerifier(): string {
    if (this._codeVerifier) return this._codeVerifier;
    const stored = store.get(`mcpOAuth.${this.serverName}.codeVerifier`) as string;
    if (!stored) throw new Error('Code verifier not found');
    this._codeVerifier = stored;
    return stored;
  }
}
*/

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

// Initialize MCP manager (will set parent window after mainWindow is created)
let mcpManager: MCPManager;

// Helper function to get Jira/Confluence credentials from settings or env
function getJiraCredentials() {
  const userSettings = store.get('userSettings', {}) as any;
  return {
    domain: userSettings.jiraDomain || process.env.JIRA_DOMAIN,
    email: userSettings.jiraEmail || process.env.JIRA_EMAIL,
    apiToken: userSettings.jiraApiToken || process.env.JIRA_API_TOKEN,
  };
}

// Initialize Jira service if configured and enabled
let jiraService: JiraService | null = null;
const jiraCredentials = getJiraCredentials();
const initialUserSettings = store.get('userSettings', {}) as any;
if (jiraCredentials.domain && jiraCredentials.email && jiraCredentials.apiToken && initialUserSettings.jiraEnabled) {
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
    title: 'PM-OS',
    icon: process.platform === 'darwin'
      ? path.join(__dirname, '../build/icon.icns')
      : path.join(__dirname, '../build/icon.png'),
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

  // Initialize MCP manager with mainWindow as parent
  mcpManager = new MCPManager(store, mainWindow);

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
  const showWindowAndSwitchTab = (tab: 'tasks' | 'meetings' | 'strategize' | 'chats', focusInput = false) => {
    if (!mainWindow) {
      createWindow();
      // Wait for window to be ready before sending event
      setTimeout(() => {
        if (mainWindow) {
          console.log(`Switching to ${tab} tab after window creation`);
          mainWindow.webContents.send('switch-tab', tab);
          if (focusInput) {
            // Add delay to allow React to mount the TaskInput component
            setTimeout(() => {
              if (mainWindow) {
                mainWindow.webContents.send('focus-task-input');
              }
            }, 200);
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
            // Add delay to allow React to mount the TaskInput component
            setTimeout(() => {
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('focus-task-input');
              }
            }, 200);
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

  // Register cmd+shift+s to show window and switch to strategize tab
  globalShortcut.unregister('CommandOrControl+Shift+S');
  const strategizeSuccess = globalShortcut.register('CommandOrControl+Shift+S', () => {
    console.log('Strategize hotkey triggered!');
    showWindowAndSwitchTab('strategize');
  });

  if (!strategizeSuccess) {
    console.error('Failed to register strategize shortcut: CommandOrControl+Shift+S');
  } else {
    console.log('Successfully registered cmd+shift+s shortcut');
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
  const startTime = Date.now();
  console.log(`\n========================================`);
  console.log(`[Protocol] CALLBACK RECEIVED - ${new Date().toISOString()}`);
  console.log('[Protocol] Full URL:', url);

  try {
    console.log('[Protocol] Step 1: Parsing callback URL...');
    const urlObj = new URL(url);
    const provider = urlObj.searchParams.get('provider');
    const sessionId = urlObj.searchParams.get('sessionId');

    console.log(`[Protocol] ✓ URL parsed successfully`);
    console.log('[Protocol] Provider:', provider || 'MISSING');
    console.log('[Protocol] Session ID:', sessionId ? `${sessionId.substring(0, 20)}...` : 'MISSING');

    if (!provider || !sessionId) {
      console.error('[Protocol] ❌ ERROR: Missing required parameters');
      console.error('[Protocol] Expected format: pmos://callback?provider=slack&sessionId=xxx');
      console.error('[Protocol] This indicates a problem with the Vercel redirect');
      return;
    }

    // Fetch tokens from Vercel using session ID
    console.log('[Protocol] Step 2: Exchanging session ID for tokens...');
    console.log('[Protocol] Calling Vercel API: /api/exchange-token');

    const tokenResponse = await fetch(`https://pm-os.vercel.app/api/exchange-token?sessionId=${sessionId}`);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[Protocol] ❌ Failed to fetch tokens from Vercel');
      console.error('[Protocol] HTTP Status:', tokenResponse.status);
      console.error('[Protocol] Response:', tokenData);
      throw new Error(tokenData.error || 'Failed to fetch tokens');
    }

    console.log('[Protocol] ✓ Tokens received from Vercel');
    console.log('[Protocol] Token data keys:', Object.keys(tokenData));
    const { tokens } = tokenData;

    // Save tokens directly to store
    console.log('[Protocol] Step 3: Saving tokens to electron-store...');

    if (provider === 'google') {
      console.log('[Protocol] Processing Google tokens...');
      const expiresAt = Date.now() + (tokens.expires_in * 1000);
      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      };

      console.log('[Protocol] Saving to store: google_access_token (length:', tokenData.accessToken?.length || 0, ')');
      store.set('google_access_token', tokenData.accessToken);

      if (tokenData.refreshToken) {
        console.log('[Protocol] Saving to store: google_refresh_token');
        store.set('google_refresh_token', tokenData.refreshToken);
      } else {
        console.log('[Protocol] No refresh token received');
      }

      console.log('[Protocol] Saving to store: google_expires_at');
      store.set('google_expires_at', tokenData.expiresAt);
      store.set('google_oauth_scope_version', 2);

      console.log('[Protocol] ✓ Google tokens saved successfully');

      // Initialize services
      console.log('[Protocol] Step 4: Initializing Google integration...');
      await integrationManager.initialize();
      console.log('[Protocol] ✓ Google integration initialized');

      const elapsed = Date.now() - startTime;
      console.log(`[Protocol] ✓✓✓ Google connection SUCCESSFUL (took ${elapsed}ms)`);
    } else if (provider === 'slack') {
      console.log('[Protocol] Processing Slack tokens...');
      console.log('[Protocol] Token structure:', {
        has_authed_user: !!tokens.authed_user,
        has_access_token: !!tokens.access_token,
        authed_user_keys: tokens.authed_user ? Object.keys(tokens.authed_user) : []
      });

      // Slack returns tokens in authed_user for user tokens
      const accessToken = tokens.authed_user?.access_token || tokens.access_token;

      if (accessToken) {
        console.log('[Protocol] ✓ Access token found (length:', accessToken.length, ')');
        console.log('[Protocol] Saving to store: slack_access_token');
        store.set('slack_access_token', accessToken);

        if (tokens.authed_user?.refresh_token) {
          console.log('[Protocol] Saving to store: slack_refresh_token');
          store.set('slack_refresh_token', tokens.authed_user.refresh_token);
        } else {
          console.log('[Protocol] No refresh token provided (this is normal for Slack)');
        }

        if (tokens.authed_user?.expires_in) {
          console.log('[Protocol] Saving to store: slack_expires_at');
          store.set('slack_expires_at', Date.now() + (tokens.authed_user.expires_in * 1000));
        }

        console.log('[Protocol] ✓ Slack tokens saved successfully');

        // Initialize services
        console.log('[Protocol] Step 4: Initializing Slack integration...');
        await integrationManager.initialize();
        console.log('[Protocol] ✓ Slack integration initialized');

        const elapsed = Date.now() - startTime;
        console.log(`[Protocol] ✓✓✓ Slack connection SUCCESSFUL (took ${elapsed}ms)`);
      } else {
        console.error('[Protocol] ❌ ERROR: No access token found in Slack response');
        console.error('[Protocol] Token structure received:', JSON.stringify(tokens, null, 2));
        throw new Error('No access token found in Slack response');
      }
    }

    // Notify the renderer process
    console.log('[Protocol] Step 5: Notifying renderer process...');
    if (mainWindow) {
      mainWindow.webContents.send('oauth-success', { provider });
      console.log('[Protocol] ✓ oauth-success event sent to renderer');
    } else {
      console.log('[Protocol] ⚠️  WARNING: mainWindow is null, cannot notify renderer');
    }

    console.log(`[Protocol] END - Success`);
    console.log(`========================================\n`);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[Protocol] ❌❌❌ FAILED to handle OAuth callback`);
    console.error('[Protocol] Error type:', error.constructor?.name || 'unknown');
    console.error('[Protocol] Error message:', error.message || String(error));
    console.error('[Protocol] Error stack:', error.stack || 'no stack trace');
    console.error('[Protocol] Time elapsed before error:', elapsed, 'ms');

    if (mainWindow) {
      mainWindow.webContents.send('oauth-error', { error: String(error) });
      console.error('[Protocol] oauth-error event sent to renderer');
    }

    console.error(`[Protocol] END - Failed`);
    console.error(`========================================\n`);
  }
}

// Claude Code session management functions
// OpenAI chat session for Strategize tab
// Disabled: Old strategize/MCP SDK code
// Now using custom HTTPMCPClient with MCPManager
/*
let strategizeChatHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

interface MCPClientInfo {
  name: string;
  client: any;
  transport: any;
  tools: Array<{ name: string; description?: string; inputSchema: any }>;
}
let mcpClients: Map<string, MCPClientInfo> = new Map();
*/

// Disabled: Old startStrategizeSession using MCP SDK
/*
async function _startStrategizeSession(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return { success: false, error: 'OpenAI API key not found. Please add it to your .env file.' };
    }

    // Read local MD files for context
    let fileContext = '';
    try {
      const files = fs.readdirSync(folderPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      console.log(`[Strategize] Found ${mdFiles.length} MD files in ${folderPath}`);

      // Read up to 10 MD files for context (to avoid token limits)
      const filesToRead = mdFiles.slice(0, 10);
      const fileContents = filesToRead.map(filename => {
        const filePath = path.join(folderPath, filename);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          return `## ${filename}\n${content}\n`;
        } catch (e) {
          return `## ${filename}\n[Could not read file]\n`;
        }
      }).join('\n---\n\n');

      if (fileContents) {
        fileContext = `\n\nProject Documentation:\n${fileContents}`;
      }
    } catch (error) {
      console.log('[Strategize] Could not read folder files:', error);
    }

    // Read custom system prompt if configured
    const userSettings = store.get('userSettings', {}) as any;
    let customSystemPrompt = '';
    if (userSettings.strategizeSystemPromptPath) {
      try {
        const promptPath = userSettings.strategizeSystemPromptPath;
        if (fs.existsSync(promptPath)) {
          customSystemPrompt = fs.readFileSync(promptPath, 'utf-8');
          console.log(`[Strategize] Loaded custom system prompt from ${promptPath}`);
        } else {
          console.log(`[Strategize] Custom system prompt file not found: ${promptPath}`);
        }
      } catch (error) {
        console.error('[Strategize] Could not read custom system prompt:', error);
      }
    }

    // Initialize chat with system prompt including file context and custom instructions
    const projectName = folderPath.split('/').pop();
    let systemPromptContent = `You are a helpful AI assistant for the project "${projectName}".

Location: ${folderPath}

You have access to the project's documentation below. Use this context to answer questions about the project, its goals, features, and implementation details.${fileContext}

Be concise and helpful. When answering, prioritize information from the documentation above.`;

    // Add custom system prompt if provided
    if (customSystemPrompt) {
      systemPromptContent += `\n\n---\n\nADDITIONAL INSTRUCTIONS:\n${customSystemPrompt}`;
    }

    strategizeChatHistory = [{
      role: 'system',
      content: systemPromptContent
    }];

    console.log('[Strategize] Session started with OpenAI and local file context');

    // Start OAuth callback server for MCP authentication
    try {
      await startOAuthCallbackServer();
    } catch (error) {
      console.error('[Strategize] Failed to start OAuth server:', error);
    }

    // Load enabled MCP servers (userSettings already loaded above)
    if (userSettings.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(userSettings.mcpServers)) {
        const config = serverConfig as any;
        if (config.enabled) {
          try {
            if (config.transport === 'stdio' && config.command) {
              // Connect stdio MCP (e.g., Granola)
              await connectMCPServerStdio(serverName, config.command, config.args || []);
              console.log(`[MCP] Connected to ${serverName} (stdio)`);
            } else if (config.transport === 'sse' && config.url) {
              // Connect HTTP/SSE MCP (e.g., Amplitude, Clockwise)
              await connectMCPServerSSE(serverName, config.url);
              console.log(`[MCP] Connected to ${serverName} (SSE)`);
            } else {
              console.log(`[MCP] Skipping ${serverName} - missing configuration`);
            }
          } catch (error) {
            console.error(`[MCP] Failed to connect to ${serverName}:`, error);
          }
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to start session:', error);
    return { success: false, error: error.message };
  }
}
*/

// Disabled: Old MCP SDK helper functions
// Now using custom HTTPMCPClient with MCPManager
/*
// MCP Helper Functions
async function connectMCPServerStdio(name: string, command: string, args: string[]): Promise<void> {
  console.log(`[MCP] Connecting to ${name} (stdio) with command: ${command} ${args.join(' ')}`);

  const transport = new StdioClientTransport({
    command,
    args,
  });

  const client = new Client({
    name: 'pm-os-strategize',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  await client.connect(transport);

  // List available tools
  const toolsResult = await client.listTools();
  const tools = toolsResult.tools;

  console.log(`[MCP] ${name} provides ${tools.length} tools:`, tools.map(t => t.name).join(', '));

  mcpClients.set(name, {
    name,
    client,
    transport,
    tools,
  });
}

async function connectMCPServerSSE(name: string, url: string): Promise<void> {
  console.log(`[MCP] Connecting to ${name} (SSE) at: ${url}`);

  try {
    // Create OAuth provider for this server
    const authProvider = new MCPOAuthProvider(name);

    // Create transport with OAuth support
    const transport = new SSEClientTransport(new URL(url), {
      authProvider,
    });

    const client = new Client({
      name: 'pm-os-strategize',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    // Connect - this will trigger OAuth if needed
    await client.connect(transport);

    // List available tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools;

    console.log(`[MCP] ${name} provides ${tools.length} tools:`, tools.map(t => t.name).join(', '));

    mcpClients.set(name, {
      name,
      client,
      transport,
      tools,
    });
  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || error.code === 'UNAUTHORIZED') {
      console.log(`[MCP] ${name} requires OAuth - user should complete authentication in browser`);
      throw new Error(`OAuth required for ${name}. Please complete authentication in your browser.`);
    }
    throw error;
  }
}

async function _disconnectMCPServers(): Promise<void> {
  for (const [name, clientInfo] of mcpClients.entries()) {
    try {
      await clientInfo.client.close();
      console.log(`[MCP] Disconnected ${name}`);
    } catch (error) {
      console.error(`[MCP] Error disconnecting ${name}:`, error);
    }
  }
  mcpClients.clear();
}
*/

// Disabled: Old MCP tool functions (were used by _sendStrategizeMessage)
/*
function getMCPToolsForOpenAI(): Array<{ type: 'function'; function: { name: string; description?: string; parameters: any } }> {
  const tools: Array<{ type: 'function'; function: { name: string; description?: string; parameters: any } }> = [];

  for (const [serverName, clientInfo] of mcpClients.entries()) {
    for (const tool of clientInfo.tools) {
      tools.push({
        type: 'function',
        function: {
          name: `${serverName}__${tool.name}`, // Prefix with server name to avoid conflicts
          description: tool.description || '',
          parameters: tool.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }

  return tools;
}

async function callMCPTool(toolName: string, args: any): Promise<any> {
  // Extract server name from tool name (format: servername__toolname)
  const [serverName, actualToolName] = toolName.split('__');

  const clientInfo = mcpClients.get(serverName);
  if (!clientInfo) {
    throw new Error(`MCP server ${serverName} not connected`);
  }

  console.log(`[MCP] Calling tool ${actualToolName} on ${serverName} with args:`, args);

  const result = await clientInfo.client.callTool({
    name: actualToolName,
    arguments: args,
  });

  return result;
}
*/

async function startClaudeCodeSession(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate folder path
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { success: false, error: 'Invalid folder path' };
    }

    console.log('[Claude Code] Starting Claude Code CLI for folder:', folderPath);

    // Get user settings for Claude CLI path
    const userSettings = store.get('userSettings', {}) as any;

    // Detect Claude CLI path
    let claudePath = '/Users/tommykeeley/.local/bin/claude';
    const possiblePaths = [
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];

    if (userSettings.claudeCodePath) {
      possiblePaths.unshift(userSettings.claudeCodePath);
    }

    let foundClaude = false;
    for (const checkPath of possiblePaths) {
      try {
        if (fs.existsSync(checkPath)) {
          claudePath = checkPath;
          foundClaude = true;
          console.log('[Claude Code] Found Claude CLI at:', claudePath);
          break;
        }
      } catch (e) {
        // Continue checking
      }
    }

    if (!foundClaude) {
      return {
        success: false,
        error: 'Claude Code CLI not found. Please install it from https://docs.anthropic.com/en/docs/agents/claude-code'
      };
    }

    // Stop existing process if any
    if (claudeProcess) {
      try {
        claudeProcess.kill('SIGTERM');
      } catch (e) {
        console.error('[Claude Code] Error killing old process:', e);
      }
    }

    console.log('[Claude Code] Starting Claude CLI with PTY...');
    console.log('[Claude Code] Command:', claudePath);
    console.log('[Claude Code] CWD:', folderPath);

    // Use createRequire to load node-pty in ESM context
    const require = createRequire(import.meta.url);
    const pty = require('node-pty');

    // Get terminal size for PTY
    const cols = 120;
    const rows = 30;

    // Spawn Claude Code with PTY
    claudeProcess = pty.spawn(claudePath, ['--no-chrome', '--dangerously-skip-permissions'], {
      name: 'xterm-color',
      cols,
      rows,
      cwd: folderPath,
      env: process.env,
    });

    console.log('[Claude Code] PTY process spawned with PID:', claudeProcess.pid);

    // Don't send startup messages - let Claude Code handle it
    // Frontend will show ready message once startup completes

    // Forward PTY output to terminal
    let startupComplete = false;
    let startupBuffer = '';
    let startupTimer: NodeJS.Timeout | null = null;

    claudeProcess.onData((data: string) => {
      if (mainWindow && mainWindow.webContents) {
        if (!startupComplete) {
          // Buffer startup data to detect when ready
          startupBuffer += data;

          // Clear existing timer
          if (startupTimer) {
            clearTimeout(startupTimer);
          }

          // Check if we've seen key indicators that Claude is ready
          const hasPrompt = startupBuffer.includes('bypass permissions') ||
                           startupBuffer.includes('Recent activity') ||
                           startupBuffer.match(/[❯›>]/);

          if (hasPrompt && startupBuffer.length > 500) {
            // Wait an extra second to ensure Claude is fully initialized
            startupTimer = setTimeout(() => {
              startupComplete = true;
              console.log('[Claude Code] Startup complete, Claude is ready');

              // Send ready message to frontend
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('claude-terminal-data',
                  `\r\n✓ Ready - ask me anything about ${folderPath.split('/').pop()}\r\n\r\n`
                );
              }
            }, 1000);
          }
        } else {
          // After startup, pass all data through
          // Frontend will handle filtering for chat display
          mainWindow.webContents.send('claude-terminal-data', data);
        }
      }
    });

    // Handle PTY exit
    claudeProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      console.log('[Claude Code] Process exited:', exitCode, signal);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('claude-terminal-exit', exitCode);
      }
      claudeProcess = null;
    });

    console.log('[Claude Code] Started Claude Code CLI successfully');
    return { success: true };
  } catch (error: any) {
    console.error('[Claude Code] Failed to start session:', error);
    return { success: false, error: error.message };
  }
}

// Disabled: Old sendStrategizeMessage using MCP SDK
/*
async function _sendStrategizeMessage(message: string): Promise<{ success: boolean; error?: string }> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    // Add user message to history
    strategizeChatHistory.push({ role: 'user', content: message });

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Get MCP tools for OpenAI
    const mcpTools = getMCPToolsForOpenAI();
    const hasTools = mcpTools.length > 0;

    console.log(`[Strategize] Sending message with ${mcpTools.length} MCP tools available`);

    // Create completion with tools if available
    const completionParams: any = {
      model: 'gpt-4-turbo-preview',
      messages: strategizeChatHistory,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    };

    if (hasTools) {
      completionParams.tools = mcpTools;
      completionParams.tool_choice = 'auto';
    }

    let fullResponse = '';
    let toolCalls: any[] = [];
    let currentToolCall: any = null;

    // Stream response from OpenAI
    const stream = await openai.chat.completions.create(completionParams);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle regular content
      if (delta?.content) {
        fullResponse += delta.content;
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('strategize-stream', delta.content);
        }
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.index !== undefined) {
            if (!toolCalls[toolCallDelta.index]) {
              toolCalls[toolCallDelta.index] = {
                id: toolCallDelta.id || '',
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }

            currentToolCall = toolCalls[toolCallDelta.index];

            if (toolCallDelta.function?.name) {
              currentToolCall.function.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              currentToolCall.function.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }
    }

    // If there were tool calls, execute them
    if (toolCalls.length > 0) {
      console.log('[Strategize] OpenAI requested tool calls:', toolCalls.map(tc => tc.function.name));

      // Add assistant message with tool calls to history
      strategizeChatHistory.push({
        role: 'assistant',
        content: fullResponse || null,
        tool_calls: toolCalls,
      } as any);

      // Execute each tool call
      for (const toolCall of toolCalls) {
        try {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`[Strategize] Executing tool ${toolName}`);

          const result = await callMCPTool(toolName, toolArgs);

          // Add tool result to history
          strategizeChatHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result.content),
          } as any);

          // Send status to frontend
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('strategize-stream', `\n\n*[Used tool: ${toolName}]*\n\n`);
          }
        } catch (error: any) {
          console.error(`[Strategize] Tool call failed:`, error);
          strategizeChatHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message }),
          } as any);
        }
      }

      // Make another call to OpenAI with tool results
      const followUpStream = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: strategizeChatHistory,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      });

      let followUpResponse = '';
      for await (const chunk of followUpStream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content && mainWindow && mainWindow.webContents) {
          followUpResponse += content;
          mainWindow.webContents.send('strategize-stream', content);
        }
      }

      strategizeChatHistory.push({ role: 'assistant', content: followUpResponse });
    } else {
      // No tool calls, just add the response
      strategizeChatHistory.push({ role: 'assistant', content: fullResponse });
    }

    // Send completion signal
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('strategize-complete');
    }

    console.log('[Strategize] Message sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to send message:', error);
    return { success: false, error: error.message };
  }
}
*/

async function sendClaudeCodeMessage(message: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!claudeProcess) {
      return { success: false, error: 'No active Claude Code session' };
    }

    console.log('[Claude Code] Sending input to PTY:', message.substring(0, 50));
    claudeProcess.write(message);
    return { success: true };
  } catch (error: any) {
    console.error('[Claude Code] Failed to send message:', error);
    return { success: false, error: error.message };
  }
}

function stopClaudeCodeSession(): { success: boolean } {
  try {
    console.log('[Claude Code] Stopping PTY session');
    if (claudeProcess) {
      claudeProcess.kill('SIGTERM');
      setTimeout(() => {
        if (claudeProcess) {
          claudeProcess.kill('SIGKILL');
          claudeProcess = null;
        }
      }, 2000);
    }
    return { success: true };
  } catch (error: any) {
    console.error('[Claude Code] Failed to stop session:', error);
    return { success: false };
  }
}

function getClaudeCodeHistory() {
  return [];
}

// Start local HTTP server for Chrome extension sync
function startExtensionSyncServer() {
  const PORT = 54321;

  const server = http.createServer((req, res) => {
    // Set CORS headers to allow requests from Chrome extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Handle POST /tasks - Add task from extension
    if (req.method === 'POST' && req.url === '/tasks') {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const task = JSON.parse(body);

          // Get existing tasks
          const tasks = store.get('tasks', []) as Task[];

          // Add new task
          const newTask = {
            ...task,
            id: task.id || randomUUID(),
          };

          tasks.unshift(newTask);
          store.set('tasks', tasks);

          console.log('[Extension Sync] Task added from Chrome extension:', newTask.title);

          // Notify renderer if window exists
          if (mainWindow) {
            mainWindow.webContents.send('task-added', newTask);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, task: newTask }));
        } catch (error) {
          console.error('[Extension Sync] Error adding task:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
        }
      });

      return;
    }

    // Handle GET /tasks - Get all tasks for extension
    if (req.method === 'GET' && req.url === '/tasks') {
      try {
        const tasks = store.get('tasks', []) as Task[];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tasks }));
      } catch (error) {
        console.error('[Extension Sync] Error getting tasks:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Server error' }));
      }
      return;
    }

    // Handle GET /ping - Health check
    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'PM-OS is running' }));
      return;
    }

    // Handle POST /jira-field-options - Get Pillar and Pod options from Jira
    if (req.method === 'POST' && req.url === '/jira-field-options') {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { projectKey } = JSON.parse(body);

          if (!jiraService) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Jira not configured' }));
            return;
          }

          const options = await jiraService.getPillarAndPodOptions(projectKey || 'AMP');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...options }));
        } catch (error) {
          console.error('[Extension Sync] Error getting Jira field options:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Server error' }));
        }
      });

      return;
    }

    // Handle POST /jira-create-direct - Create Jira ticket directly from modal submission
    if (req.method === 'POST' && req.url === '/jira-create-direct') {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const taskData = JSON.parse(body);
          console.log('[Jira Create Direct] Received Jira creation request:', taskData.title);

          const userSettings = store.get('userSettings', {}) as any;

          if (!jiraService) {
            console.error('[Jira Create Direct] Jira service not configured');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Jira not configured' }));
            return;
          }

          // Create the Jira ticket
          const issue = await jiraService.createIssue({
            summary: taskData.title,
            description: taskData.description,
            projectKey: userSettings.jiraDefaultProject || 'AMP',
            issueType: userSettings.jiraDefaultIssueType || 'Task',
            assigneeName: taskData.assigneeName,
            assigneeEmail: taskData.assigneeEmail,
            parent: taskData.parent,
            priority: taskData.priority,
            pillar: taskData.pillar,
            pod: taskData.pod,
          });

          const jiraUrl = jiraService.getIssueUrl(issue.key);
          console.log('[Jira Create Direct] Jira ticket created:', issue.key);

          // Send confirmation reply in Slack
          const botToken = store.get('slack_bot_token') as string;
          if (botToken) {
            const confirmMessage = `🎫 Jira ticket created: <${jiraUrl}|${issue.key}>`;

            await fetch('https://slack.com/api/chat.postMessage', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                channel: taskData.channel,
                thread_ts: taskData.threadTs,
                text: confirmMessage,
              }),
            });

            // Update emoji reaction from eyes to checkmark
            await fetch('https://slack.com/api/reactions.remove', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                channel: taskData.channel,
                timestamp: taskData.messageTs,
                name: 'eyes',
              }),
            });

            await fetch('https://slack.com/api/reactions.add', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                channel: taskData.channel,
                timestamp: taskData.messageTs,
                name: 'white_check_mark',
              }),
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            jiraKey: issue.key,
            jiraUrl,
          }));
        } catch (error) {
          console.error('[Jira Create Direct] Error creating Jira ticket:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Failed to create Jira ticket' }));
        }
      });

      return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  });

  server.listen(PORT, 'localhost', () => {
    console.log(`[Extension Sync] Server running on http://localhost:${PORT}`);
  });

  // Handle server errors
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`[Extension Sync] Port ${PORT} is already in use, extension sync may not work`);
    } else {
      console.error('[Extension Sync] Server error:', error);
    }
  });

  return server;
}

// Register custom protocol for MCP OAuth redirects
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('pmos', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('pmos');
}

// Handle MCP OAuth redirects
app.on('open-url', async (event, url) => {
  event.preventDefault();
  console.log('[MCP OAuth] Received redirect:', url);

  // Parse the OAuth callback URL
  const urlObj = new URL(url);
  if (urlObj.protocol === 'pmos:' && urlObj.pathname.startsWith('//oauth/callback/')) {
    const serverName = urlObj.pathname.split('/')[3];
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');

    console.log(`[MCP OAuth] Callback for ${serverName}, code: ${code?.substring(0, 10)}...`);

    if (code && serverName) {
      // Notify renderer about OAuth completion
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('mcp-oauth-callback', { serverName, code, state });
      }

      // Store for later use when finishing auth
      store.set(`mcpOAuth.${serverName}.authCode`, code);
      store.set(`mcpOAuth.${serverName}.authState`, state);
    }
  }
});

app.whenReady().then(async () => {
  app.setName('PM OS');
  createWindow();
  registerHotkey();

  // Initialize integrations with stored tokens
  console.log('[Main] About to initialize integrationManager...');
  await integrationManager.initialize();
  console.log('[Main] integrationManager initialization complete');

  // Start extension sync server
  startExtensionSyncServer();

  // Start OAuth callback server for MCP authentication
  try {
    await startOAuthCallbackServer();
    console.log('[Main] OAuth callback server started');
  } catch (error) {
    console.error('[Main] Failed to start OAuth callback server:', error);
  }

  // Start Slack events server
  const slackEventsServer = new SlackEventsServer();
  slackEventsServer.setTaskCreateHandler(async (taskData) => {
    try {
      const tasks = store.get('tasks', []) as Task[];
      const now = new Date().toISOString();
      const newTask: Task = {
        id: randomUUID(),
        title: taskData.title,
        completed: false,
        source: taskData.source || 'slack',
        sourceId: taskData.sourceId,
        priority: taskData.priority || 'medium',
        context: taskData.context,
        description: taskData.description || undefined,
        linkedItems: taskData.linkedItems || [],
        createdAt: now,
        updatedAt: now,
      };

      tasks.push(newTask);
      store.set('tasks', tasks);

      console.log('[Main] Task created from Slack mention:', newTask.title);
      if (taskData.description) {
        console.log('[Main] Task description:', taskData.description);
      }

      // Notify renderer if window exists
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('task-created', newTask);
      }
    } catch (error) {
      console.error('[Main] Failed to create task from Slack mention:', error);
    }
  });

  // Set Jira ticket creation handler
  slackEventsServer.setJiraCreateHandler(async (request) => {
    const logFile = path.join(os.homedir(), 'pm-os-jira-debug.log');
    const log = (msg: string) => {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
      console.log(msg);
    };

    log('[Main] Jira ticket creation requested: ' + request.summary);
    log('[Main] jiraService exists: ' + !!jiraService);

    if (!jiraService) {
      const userSettings = store.get('userSettings', {}) as any;
      log('[Main] Jira service not available. Settings: ' + JSON.stringify({
        jiraEnabled: userSettings.jiraEnabled,
        hasDomain: !!userSettings.jiraDomain,
        hasEmail: !!userSettings.jiraEmail,
        hasToken: !!userSettings.jiraApiToken,
      }));
      throw new Error('Jira not configured or not enabled');
    }

    const userSettings = store.get('userSettings', {}) as any;
    log('[Main] Creating Jira issue with: ' + JSON.stringify({
      projectKey: userSettings.jiraDefaultProject || 'AMP',
      issueType: userSettings.jiraDefaultIssueType || 'Task',
      assigneeName: request.assigneeName,
      assigneeEmail: request.assigneeEmail,
      reporterName: request.reporterName,
      reporterEmail: request.reporterEmail,
      parent: request.parent,
      priority: request.priority,
      pillar: request.pillar,
      pod: request.pod,
    }));

    const issue = await jiraService.createIssue({
      summary: request.summary,
      description: request.description,
      projectKey: userSettings.jiraDefaultProject || 'AMP',
      issueType: userSettings.jiraDefaultIssueType || 'Task',
      assigneeName: request.assigneeName,
      assigneeEmail: request.assigneeEmail,
      reporterName: request.reporterName,
      reporterEmail: request.reporterEmail,
      parent: request.parent,
      priority: request.priority,
      pillar: request.pillar,
      pod: request.pod,
    });

    log('[Main] Jira issue created: ' + issue.key);

    return {
      key: issue.key,
      url: jiraService.getIssueUrl(issue.key),
    };
  });

  // Set Confluence page creation handler
  slackEventsServer.setConfluenceCreateHandler(async (request) => {
    console.log('[Main] Confluence page creation requested:', request.title);

    if (!confluenceService) {
      const userSettings = store.get('userSettings', {}) as any;
      console.log('[Main] Confluence service not available. Settings:', {
        jiraEnabled: userSettings.jiraEnabled,
        hasDomain: !!userSettings.jiraDomain,
        hasEmail: !!userSettings.jiraEmail,
        hasToken: !!userSettings.jiraApiToken,
      });
      throw new Error('Confluence not configured (requires Jira credentials)');
    }

    // Get user settings first for custom prompt
    const userSettings = store.get('userSettings', {}) as any;

    // Use OpenAI to create clean, simple content from context
    let pageBody = request.body;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (openaiApiKey) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        console.log('[Main] Using OpenAI to format Confluence content');

        // Use custom prompt from settings or default
        const defaultPrompt = 'You are creating a simple Confluence page. Your ONLY job is to capture what was actually discussed in the conversation - nothing more. DO NOT add sections like "Overview", "Purpose", "Action Items", or any structure that was not explicitly discussed. DO NOT invent objectives, goals, or requirements. Just write down what was actually said in simple, clear paragraphs. If very little was discussed, write very little. Be literal and concise.';
        const systemPrompt = userSettings.confluenceSystemPrompt || defaultPrompt;

        console.log('[Main] Using', userSettings.confluenceSystemPrompt ? 'custom' : 'default', 'system prompt');

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `Create content for a Confluence page titled "${request.title}". Here's the context from the conversation:\n\n${request.body}\n\nCreate simple, clean page content that captures this context without adding extra structure or inventing details.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        });

        pageBody = completion.choices[0].message.content || request.body;
        console.log('[Main] OpenAI formatted content successfully');
      } catch (error) {
        console.error('[Main] OpenAI formatting failed, using raw context:', error);
        // Fall back to raw context if OpenAI fails
      }
    } else {
      console.log('[Main] No OpenAI key, using raw context');
    }
    const spaceKey = request.spaceKey || userSettings.confluenceDefaultSpace || 'PA1';
    const parentId = request.parentId || userSettings.confluenceDefaultParentId;

    console.log('[Main] Creating Confluence page with:', {
      spaceKey,
      parentId,
      title: request.title,
    });

    const page = await confluenceService.createPage({
      spaceKey,
      title: request.title,
      body: pageBody,
      parentId,
    });

    console.log('[Main] Confluence page created:', page.id);

    return {
      id: page.id,
      url: page.url,
    };
  });

  slackEventsServer.start().then(() => {
    console.log('[Main] Slack events server started successfully');
  }).catch((error) => {
    console.error('[Main] Failed to start Slack events server:', error);
  });

  // Start Slack Digest Service (Smart Inbox)
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const slackToken = store.get('slack_access_token') as string | undefined;

  if (openaiApiKey && slackToken) {
    const digestService = new SlackDigestService(openaiApiKey, slackToken);
    digestService.start();
    console.log('[Main] Slack Digest Service started');
  } else {
    console.log('[Main] Slack Digest Service not started - missing OpenAI key or Slack token');
  }

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

  // Get the display where the window is currently located
  const windowBounds = mainWindow.getBounds();
  const currentDisplay = screen.getDisplayMatching(windowBounds);
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = currentDisplay.workArea;

  if (isPinned) {
    // Pin to right side of current display
    // workArea already accounts for menu bar and dock dynamically across all monitors
    const x = displayX + screenWidth - WINDOW_WIDTH;
    const y = displayY;

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
    // Unpin - restore original size and center on current display
    mainWindow.setResizable(true);
    mainWindow.setBounds({
      x: displayX + Math.floor((screenWidth - WINDOW_WIDTH) / 2),
      y: displayY + Math.floor((screenHeight - WINDOW_HEIGHT) / 2),
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
    openaiApiKey: process.env.OPENAI_API_KEY,
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
  const settings = store.get('userSettings', {}) as any;
  // Include slack_bot_token from store
  const slackBotToken = store.get('slack_bot_token') as string;
  if (slackBotToken) {
    settings.slackBotToken = slackBotToken;
  }
  return settings;
});

ipcMain.handle('save-user-settings', (_event, settings: any) => {
  store.set('userSettings', settings);

  // If Slack bot token changed, save it separately for SlackEvents
  if (settings.slackBotToken) {
    store.set('slack_bot_token', settings.slackBotToken);
    console.log('[Settings] Slack bot token saved');
  }

  // If MCP server settings changed, sync to MCPManager
  if (settings.mcpServers) {
    console.log('[Settings] Syncing MCP server configs to MCPManager');
    for (const [serverName, serverConfig] of Object.entries(settings.mcpServers)) {
      const config = serverConfig as any;

      // Only sync HTTP MCP servers (stdio ones use Claude CLI)
      if (config.transport === 'sse' && config.url) {
        // Use config.name (capitalized) as the key to match what startMCPOAuth uses
        const configName = config.name || serverName;
        mcpManager.saveConfig(configName, {
          name: configName,
          url: config.url,
          clientId: config.clientId,
          enabled: config.enabled || false,
        });
        console.log(`[Settings] Synced MCP config for ${configName} (key: ${serverName})`);
      }
    }
  }

  // If Jira/Confluence credentials or enabled state changed, reinitialize services
  if (settings.jiraDomain !== undefined || settings.jiraEmail !== undefined ||
      settings.jiraApiToken !== undefined || settings.jiraEnabled !== undefined) {
    const updatedSettings = store.get('userSettings', {}) as any;

    // Reinitialize or clear Jira service based on enabled state
    if (updatedSettings.jiraEnabled && updatedSettings.jiraDomain &&
        updatedSettings.jiraEmail && updatedSettings.jiraApiToken) {
      jiraService = new JiraService({
        domain: updatedSettings.jiraDomain,
        email: updatedSettings.jiraEmail,
        apiToken: updatedSettings.jiraApiToken,
      });

      // Also reinitialize Confluence service (uses same credentials)
      confluenceService = new ConfluenceService({
        domain: updatedSettings.jiraDomain,
        email: updatedSettings.jiraEmail,
        apiToken: updatedSettings.jiraApiToken,
      });
    } else if (settings.jiraEnabled === false) {
      // Disable services when toggled off
      jiraService = null;
      confluenceService = null;
    }
  }
});

// Generic Storage IPC Handlers
ipcMain.handle('get-stored-data', (_event, key: string) => {
  return store.get(key, null);
});

ipcMain.handle('save-data', (_event, key: string, data: any) => {
  store.set(key, data);
});

// Obsidian Integration IPC Handlers
ipcMain.handle('obsidian-list-notes', async () => {
  try {
    const userSettings = store.get('userSettings', {}) as any;
    const vaultPath = userSettings.obsidianVaultPath;

    if (!vaultPath || !fs.existsSync(vaultPath)) {
      return { success: false, error: 'Vault path not configured or does not exist' };
    }

    const notes: any[] = [];

    // Recursively read all .md files
    function readDir(dirPath: string) {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip hidden folders and .obsidian folder
          if (!item.startsWith('.')) {
            readDir(fullPath);
          }
        } else if (item.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const relativePath = path.relative(vaultPath, fullPath);

          // Parse frontmatter if exists
          let frontmatter: any = {};
          let bodyContent = content;

          if (content.startsWith('---')) {
            const endIndex = content.indexOf('---', 3);
            if (endIndex !== -1) {
              const frontmatterText = content.substring(3, endIndex).trim();
              bodyContent = content.substring(endIndex + 3).trim();

              // Simple YAML parsing (just key: value pairs)
              frontmatterText.split('\n').forEach(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex !== -1) {
                  const key = line.substring(0, colonIndex).trim();
                  const value = line.substring(colonIndex + 1).trim();
                  frontmatter[key] = value;
                }
              });
            }
          }

          notes.push({
            id: relativePath.replace(/\.md$/, '').replace(/\\/g, '/'),
            title: item.replace(/\.md$/, ''),
            path: relativePath,
            fullPath: fullPath,
            content: bodyContent,
            frontmatter,
            createdAt: stat.birthtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
          });
        }
      }
    }

    readDir(vaultPath);

    // Sort by updated time, newest first
    notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { success: true, notes };
  } catch (error: any) {
    console.error('Failed to list Obsidian notes:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('obsidian-create-note', async (_event, noteData: { title: string; content: string; tags?: string[] }) => {
  try {
    const userSettings = store.get('userSettings', {}) as any;
    const vaultPath = userSettings.obsidianVaultPath;

    if (!vaultPath || !fs.existsSync(vaultPath)) {
      return { success: false, error: 'Vault path not configured or does not exist' };
    }

    const now = new Date();
    const timestamp = now.toISOString();

    // Create frontmatter
    let frontmatter = '---\n';
    frontmatter += `created: ${timestamp}\n`;
    frontmatter += `updated: ${timestamp}\n`;
    if (noteData.tags && noteData.tags.length > 0) {
      frontmatter += `tags: [${noteData.tags.join(', ')}]\n`;
    }
    frontmatter += '---\n\n';

    const fullContent = frontmatter + noteData.content;

    // Sanitize filename
    const safeTitle = noteData.title.replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `${safeTitle}.md`;
    const filePath = path.join(vaultPath, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return { success: false, error: 'A note with this title already exists' };
    }

    fs.writeFileSync(filePath, fullContent, 'utf-8');

    return {
      success: true,
      note: {
        id: safeTitle,
        title: safeTitle,
        path: fileName,
        fullPath: filePath,
        content: noteData.content,
        frontmatter: {
          created: timestamp,
          updated: timestamp,
          tags: noteData.tags || [],
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    };
  } catch (error: any) {
    console.error('Failed to create Obsidian note:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('obsidian-update-note', async (_event, noteId: string, content: string) => {
  try {
    const userSettings = store.get('userSettings', {}) as any;
    const vaultPath = userSettings.obsidianVaultPath;

    if (!vaultPath || !fs.existsSync(vaultPath)) {
      return { success: false, error: 'Vault path not configured or does not exist' };
    }

    const filePath = path.join(vaultPath, `${noteId}.md`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Note not found' };
    }

    const existingContent = fs.readFileSync(filePath, 'utf-8');

    // Preserve frontmatter, update content
    let newContent = content;
    if (existingContent.startsWith('---')) {
      const endIndex = existingContent.indexOf('---', 3);
      if (endIndex !== -1) {
        let frontmatter = existingContent.substring(0, endIndex + 3);
        // Update the updated timestamp
        frontmatter = frontmatter.replace(/updated: .*\n/, `updated: ${new Date().toISOString()}\n`);
        newContent = frontmatter + '\n\n' + content;
      }
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');

    return { success: true };
  } catch (error: any) {
    console.error('Failed to update Obsidian note:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('obsidian-delete-note', async (_event, noteId: string) => {
  try {
    const userSettings = store.get('userSettings', {}) as any;
    const vaultPath = userSettings.obsidianVaultPath;

    if (!vaultPath || !fs.existsSync(vaultPath)) {
      return { success: false, error: 'Vault path not configured or does not exist' };
    }

    const filePath = path.join(vaultPath, `${noteId}.md`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Note not found' };
    }

    fs.unlinkSync(filePath);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete Obsidian note:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('obsidian-open-in-app', async (_event, noteId: string) => {
  try {
    const userSettings = store.get('userSettings', {}) as any;
    const vaultPath = userSettings.obsidianVaultPath;

    if (!vaultPath) {
      return { success: false, error: 'Vault path not configured' };
    }

    // Get vault name from path
    const vaultName = path.basename(vaultPath);

    // Construct Obsidian URI
    const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(noteId)}`;

    await shell.openExternal(uri);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to open note in Obsidian:', error);
    return { success: false, error: error.message };
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
ipcMain.handle('start-oauth', async (_event, provider: 'google' | 'slack' | 'zoom' | 'amplitude' | 'granola' | 'clockwise') => {
  const startTime = Date.now();
  console.log(`\n========================================`);
  console.log(`[OAuth] START - ${new Date().toISOString()}`);
  console.log(`[OAuth] Provider: ${provider}`);
  console.log(`[OAuth] User initiated OAuth flow from Settings`);

  try {
    let authUrl: string;

    // MCP providers use their own OAuth endpoints
    if (provider === 'amplitude' || provider === 'granola' || provider === 'clockwise') {
      // MCP servers typically handle OAuth through their web interfaces
      // These URLs will redirect users to authenticate and grant access
      const mcpUrls: Record<string, string> = {
        amplitude: 'https://pm-os.vercel.app/api/oauth/amplitude/authorize',
        granola: 'https://pm-os.vercel.app/api/oauth/granola/authorize',
        clockwise: 'https://pm-os.vercel.app/api/oauth/clockwise/authorize',
      };
      authUrl = mcpUrls[provider];
      console.log(`[OAuth] MCP provider detected: ${provider}`);
      console.log(`[OAuth] Using MCP OAuth endpoint: ${authUrl}`);
    } else {
      // Standard OAuth providers (Google, Slack, Zoom)
      authUrl = `https://pm-os.vercel.app/api/oauth/${provider}/authorize`;
      console.log('[OAuth] Standard OAuth provider');
    }

    console.log('[OAuth] Step 1: Opening authorization endpoint...');
    console.log(`[OAuth] URL: ${authUrl}`);
    console.log('[OAuth] Vercel will generate the OAuth URL with server-side credentials');
    console.log('[OAuth] and redirect to the provider');

    // Open in system browser
    console.log('[OAuth] Step 2: Calling shell.openExternal()...');
    await shell.openExternal(authUrl);

    const elapsed = Date.now() - startTime;
    console.log(`[OAuth] ✓ Browser opened successfully (took ${elapsed}ms)`);
    console.log('[OAuth] Next: Browser redirects to Vercel → Provider → Authorization');
    console.log('[OAuth] After user authorizes, flow returns via /oauth-callback → pmos://');
    console.log(`[OAuth] END - Success`);
    console.log(`========================================\n`);

    return { success: true };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error('[OAuth] ❌ FAILED to start OAuth flow');
    console.error('[OAuth] Error type:', error.constructor.name);
    console.error('[OAuth] Error message:', error.message);
    console.error('[OAuth] Error stack:', error.stack);
    console.error('[OAuth] Time elapsed before error:', elapsed, 'ms');
    console.error(`[OAuth] END - Failed`);
    console.error(`========================================\n`);

    return {
      success: false,
      error: `Failed to open browser: ${error.message}. Please check console logs for details.`
    };
  }
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

// Smart Suggestions with caching (refresh once per day or on demand)
ipcMain.handle('get-smart-suggestions', async (_event, forceRefresh = false) => {
  try {
    const lastFetch = store.get('smart_suggestions_last_fetch', 0) as number;
    const cachedSuggestions = store.get('smart_suggestions_cache', []) as any[];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours (once per day)

    // Return cached suggestions if less than 24 hours old and not forcing refresh
    if (!forceRefresh && cachedSuggestions.length > 0 && (now - lastFetch) < oneDay) {
      console.log('[Smart Suggestions] Using cached suggestions (last fetch:', new Date(lastFetch).toISOString(), ')');
      return cachedSuggestions;
    }

    console.log('[Smart Suggestions] Fetching fresh suggestions...');
    const suggestions = await integrationManager.getSmartSuggestions();

    // Cache the results
    store.set('smart_suggestions_cache', suggestions);
    store.set('smart_suggestions_last_fetch', now);

    return suggestions;
  } catch (error: any) {
    console.error('Failed to get smart suggestions:', error);
    return [];
  }
});

// Force refresh smart suggestions (called when user adds/dismisses a suggestion)
ipcMain.handle('refresh-smart-suggestions', async () => {
  try {
    console.log('[Smart Suggestions] Force refresh triggered');
    const suggestions = await integrationManager.getSmartSuggestions();
    store.set('smart_suggestions_cache', suggestions);
    store.set('smart_suggestions_last_fetch', Date.now());
    return suggestions;
  } catch (error: any) {
    console.error('Failed to refresh smart suggestions:', error);
    return [];
  }
});

// Debug log handler that writes to a file
ipcMain.handle('write-debug-log', async (_event, message: string) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'debug.log');
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logPath, logLine);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to write debug log:', error);
    return { success: false, error: error.message };
  }
});

// Write debug file handler
ipcMain.handle('write-debug-file', async (_event, filename: string, content: string) => {
  try {
    const filePath = path.join(app.getPath('userData'), filename);
    fs.writeFileSync(filePath, content);
    console.log('[Main] Debug file written:', filePath);
    return { success: true, path: filePath };
  } catch (error: any) {
    console.error('Failed to write debug file:', error);
    return { success: false, error: error.message };
  }
});

// Dismiss suggestion
ipcMain.handle('dismiss-suggestion', async (_event, suggestionId: string) => {
  try {
    const dismissedSuggestions = store.get('dismissed_suggestions', []) as string[];
    if (!dismissedSuggestions.includes(suggestionId)) {
      dismissedSuggestions.push(suggestionId);
      store.set('dismissed_suggestions', dismissedSuggestions);
      console.log(`[Smart Suggestions] Dismissed suggestion: ${suggestionId}`);
    }
    return { success: true };
  } catch (error: any) {
    console.error('Failed to dismiss suggestion:', error);
    return { success: false, error: error.message };
  }
});

// Chats - Slack unread messages
ipcMain.handle('get-slack-unread-messages', async () => {
  try {
    console.log('[IPC] Getting Slack unread messages...');
    const messages = await integrationManager.getSlackUnreadMessages();
    console.log(`[IPC] Slack unread messages result: ${messages?.length || 0} messages`);
    console.log('[IPC] Messages type:', typeof messages, 'isArray:', Array.isArray(messages));
    if (messages && messages.length > 0) {
      console.log('[IPC] First message sample:', JSON.stringify(messages[0]).substring(0, 200));
    }
    console.log('[IPC] Returning messages to renderer...');
    return messages;
  } catch (error: any) {
    console.error('[IPC] Failed to get Slack unread messages:', {
      message: error?.message,
      stack: error?.stack,
      error: error,
    });
    return [];
  }
});

// Chats - Starred emails
ipcMain.handle('get-starred-emails', async () => {
  try {
    console.log('[IPC] Getting starred emails...');
    const emails = await integrationManager.getStarredEmails();
    console.log(`[IPC] Starred emails result: ${emails?.length || 0} emails`);
    return emails;
  } catch (error: any) {
    console.error('[IPC] Failed to get starred emails:', {
      message: error?.message,
      stack: error?.stack,
      error: error,
    });
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

// Slack users list
ipcMain.handle('get-slack-users', async () => {
  try {
    return await integrationManager.getSlackUsers();
  } catch (error: any) {
    console.error('Failed to get Slack users:', error);
    return [];
  }
});

// Slack thread replies
ipcMain.handle('slack-get-thread-replies', async (_event, channelId: string, threadTs: string) => {
  try {
    console.log('[IPC] Fetching Slack thread replies for channel:', channelId, 'thread:', threadTs);
    const replies = await integrationManager.getSlackThreadReplies(channelId, threadTs);
    console.log('[IPC] Fetched', replies?.length || 0, 'thread replies');
    return replies;
  } catch (error: any) {
    console.error('[IPC] Failed to get Slack thread replies:', error);
    return [];
  }
});

// Slack send reply
ipcMain.handle('slack-send-reply', async (_event, channelId: string, threadTs: string, text: string) => {
  try {
    console.log('[IPC] Sending Slack reply to channel:', channelId, 'thread:', threadTs);
    const botToken = store.get('slack_bot_token') as string;
    if (!botToken) {
      throw new Error('No Slack bot token found');
    }

    const VERCEL_API_URL = 'https://pm-os-git-main-amplitude-inc.vercel.app/api/slack';
    const response = await fetch(`${VERCEL_API_URL}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        threadTs: threadTs,
        text: text,
        botToken: botToken,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to send Slack reply');
    }

    console.log('[IPC] Slack reply sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to send Slack reply:', error);
    throw error;
  }
});

// Jira Integration Handlers
ipcMain.handle('jira-test-connection', async () => {
  if (!jiraService) {
    return { success: false, error: 'Jira not configured', details: 'Please configure Jira domain, email, and API token first.' };
  }

  try {
    return await jiraService.testConnection();
  } catch (error: any) {
    return { success: false, error: 'Connection failed', details: error.message };
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

  // Use OpenAI to create smart, concise ticket title from raw input
  let ticketSummary = request.summary;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (openaiApiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      console.log('[Main] Using OpenAI to format Jira ticket title');

      // Use custom prompt from settings or default
      const defaultPrompt = `You are extracting the core task from a message to create a Jira ticket title.

CRITICAL RULES:
1. NEVER include phrases like "create a ticket", "create jira ticket", "make a ticket" in the output
2. IGNORE all metadata like parent tickets, assignees, priorities - focus only on the actual task
3. Extract ONLY the core action/problem being described
4. Use imperative mood (e.g., "Fix bug" not "Fixing bug")
5. Keep under 80 characters
6. Be specific but concise

Examples:
- "@PM-OS create a jira ticket with parent AMP-123 and assign to @user. we can explore better ways to display long project names" → "Improve long project name display"
- "create a ticket for fixing the login bug" → "Fix login bug"
- "make a ticket to update documentation for API" → "Update API documentation"
- "I need to refactor the authentication system" → "Refactor authentication system"`;

      const systemPrompt = userSettings.jiraSystemPrompt || defaultPrompt;

      // Add current date context for date awareness
      const now = new Date();
      const dateContext = `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. When interpreting relative dates like "on the 25th", use the current month and year. If a date has already passed this month, assume it refers to next month.`;

      console.log('[Main] Using', userSettings.jiraSystemPrompt ? 'custom' : 'default', 'system prompt for Jira');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\n\n${dateContext}`,
          },
          {
            role: 'user',
            content: request.summary,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      ticketSummary = completion.choices[0].message.content?.trim() || request.summary;
      console.log('[Main] OpenAI formatted title successfully:', { original: request.summary, formatted: ticketSummary });
    } catch (error) {
      console.error('[Main] OpenAI formatting failed, using raw summary:', error);
      // Fall back to raw summary if OpenAI fails
    }
  } else {
    console.log('[Main] No OpenAI key, using raw summary');
  }

  const issue = await jiraService.createIssue({
    summary: ticketSummary,
    description: request.description,
    projectKey: request.projectKey || userSettings.jiraDefaultProject || process.env.JIRA_DEFAULT_PROJECT || '',
    issueType: request.issueType || userSettings.jiraDefaultIssueType || process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task',
    priority: request.priority,
    pillar: request.pillar,
    pod: request.pod,
    parent: request.parent,
    assigneeEmail: request.assigneeEmail,
    assigneeName: request.assigneeName,
  });

  return {
    key: issue.key,
    url: jiraService.getIssueUrl(issue.key),
  };
});

ipcMain.handle('jira-get-components', async (_event, projectKey: string) => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getComponents(projectKey);
});

ipcMain.handle('jira-get-sprints', async (_event, projectKey: string) => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getSprints(projectKey);
});

ipcMain.handle('jira-search-users', async (_event, projectKey: string, query: string) => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.searchAssignableUsers(projectKey, query);
});

ipcMain.handle('jira-get-my-issues', async () => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getMyIssues();
});

ipcMain.handle('jira-get-create-metadata', async (_event, projectKey: string, issueType: string) => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getCreateMetadata(projectKey, issueType);
});

ipcMain.handle('jira-get-pillar-pod-options', async (_event, projectKey: string, issueType: string) => {
  if (!jiraService) throw new Error('Jira not configured');
  return await jiraService.getPillarAndPodOptions(projectKey, issueType);
});

ipcMain.handle('jira-is-configured', () => {
  const userSettings = store.get('userSettings', {}) as any;
  return !!userSettings.jiraEnabled && !!jiraService;
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

// Strategize (Claude Code CLI) IPC Handlers
ipcMain.handle('strategize-authenticate-mcp', async () => {
  console.log('[IPC] strategize-authenticate-mcp called');

  try {
    // Open Terminal with Claude Code for interactive MCP authentication
    const script = `tell application "Terminal"
  activate
  do script "echo 'Amplitude MCP Authentication' && echo '===========================' && echo '' && echo 'To authenticate Amplitude MCP, type: /mcp' && echo 'Then follow the OAuth flow.' && echo '' && /Users/tommykeeley/.local/bin/claude"
end tell`;

    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to open Claude for MCP auth:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('strategize-start', async (_event, folderPath: string) => {
  console.log('[IPC] strategize-start called with folder:', folderPath);

  if (claudeProcess) {
    claudeProcess.kill();
    claudeProcess = null;
  }

  try {
    // Just store the folder path - we'll spawn a process for each message
    store.set('strategizeFolderPath', folderPath);
    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to start:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('strategize-send', async (_event, message: string, conversationHistory?: Array<{role: string, content: string}>, selectedMCPs?: string[]) => {
  console.log('[IPC] strategize-send called with message:', message);
  console.log('[IPC] Conversation history length:', conversationHistory?.length || 0);
  console.log('[IPC] Selected MCPs:', selectedMCPs);

  try {
    const folderPath = store.get('strategizeFolderPath') as string;
    if (!folderPath) {
      return { success: false, error: 'No folder path set' };
    }

    // Read custom system prompt if configured
    const userSettings = store.get('userSettings', {}) as any;
    let systemPrompt = '';
    if (userSettings.strategizeSystemPromptPath) {
      try {
        const promptPath = userSettings.strategizeSystemPromptPath;
        if (fs.existsSync(promptPath)) {
          systemPrompt = fs.readFileSync(promptPath, 'utf-8');
          console.log('[Claude] Loaded system prompt from:', promptPath);
        }
      } catch (error) {
        console.error('[Claude] Could not read system prompt:', error);
      }
    }

    // Build MCP context to guide Claude on available data sources
    // Only include selected MCPs (if any selected), otherwise include all enabled
    const mcpsToUse = (selectedMCPs && selectedMCPs.length > 0) ? selectedMCPs : [];

    if (userSettings.mcpServers && (mcpsToUse.length > 0 || !selectedMCPs || selectedMCPs.length === 0)) {
      let mcpGuidance = '\n\n## Available Data Sources\n\nYou have access to the following data sources through MCP (Model Context Protocol) servers:\n\n';
      const mcpList: string[] = [];

      // Helper to check if MCP should be included
      const shouldInclude = (mcpName: string) => {
        if (!selectedMCPs || selectedMCPs.length === 0) {
          // No selection = include all enabled
          return userSettings.mcpServers[mcpName.toLowerCase()]?.enabled;
        }
        // Include only if selected
        return mcpsToUse.includes(mcpName);
      };

      if (shouldInclude('amplitude') && userSettings.mcpServers.amplitude?.enabled) {
        mcpList.push('- **Amplitude MCP**: Query analytics data, WAU/MAU/DAU metrics, user events, charts, cohorts, and experiments');
      }
      if (shouldInclude('granola') && userSettings.mcpServers.granola?.enabled) {
        mcpList.push('- **Granola MCP**: Access meeting notes, transcripts, action items, and meeting summaries');
      }
      if (shouldInclude('clockwise') && userSettings.mcpServers.clockwise?.enabled) {
        mcpList.push('- **Clockwise MCP**: Check calendar, schedule meetings, find availability, and manage calendar events');
      }
      if (shouldInclude('atlassian') && userSettings.mcpServers.atlassian?.enabled) {
        mcpList.push('- **Atlassian MCP**: Access Jira issues/tickets, Confluence pages, and Compass service components');
      }
      if (shouldInclude('gdrive') && userSettings.mcpServers.gdrive?.enabled) {
        mcpList.push('- **Google Drive MCP**: Access Google Docs, Sheets, Slides, and Drive files');
      }
      if (shouldInclude('slack') && userSettings.mcpServers.slack?.enabled) {
        mcpList.push('- **Slack MCP**: Send messages, manage channels, and access workspace history');
      }

      if (mcpList.length > 0) {
        mcpGuidance += mcpList.join('\n') + '\n\n';
        mcpGuidance += '**IMPORTANT**: When the user asks questions about:\n';
        if (shouldInclude('amplitude') && userSettings.mcpServers.amplitude?.enabled) {
          mcpGuidance += '- Analytics, metrics, events, or users → Use Amplitude MCP tools\n';
        }
        if (shouldInclude('granola') && userSettings.mcpServers.granola?.enabled) {
          mcpGuidance += '- Meetings, notes, or action items → Use Granola MCP tools\n';
        }
        if (shouldInclude('clockwise') && userSettings.mcpServers.clockwise?.enabled) {
          mcpGuidance += '- Calendar, schedule, or availability → Use Clockwise MCP tools\n';
        }
        if (shouldInclude('atlassian') && userSettings.mcpServers.atlassian?.enabled) {
          mcpGuidance += '- Jira tickets, Confluence docs, or Compass services → Use Atlassian MCP tools\n';
        }
        if (shouldInclude('gdrive') && userSettings.mcpServers.gdrive?.enabled) {
          mcpGuidance += '- Google Docs, Sheets, Slides, or Drive files → Use Google Drive MCP tools\n';
        }
        if (shouldInclude('slack') && userSettings.mcpServers.slack?.enabled) {
          mcpGuidance += '- Slack messages, channels, or workspace data → Use Slack MCP tools\n';
        }
        mcpGuidance += '\nProactively search and use these tools when relevant to the user\'s question.\n';

        systemPrompt += mcpGuidance;
      }
    }

    // Add PM-OS Tasks context
    try {
      const tasks = store.get('tasks', []) as any[];
      if (tasks && tasks.length > 0) {
        const incompleteTasks = tasks.filter(t => !t.completed);
        if (incompleteTasks.length > 0) {
          systemPrompt += '\n\n## PM-OS Tasks\n\nThe user has the following tasks in their PM-OS task list:\n\n';
          incompleteTasks.forEach((task: any) => {
            const priority = task.priority || 'medium';
            const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
            systemPrompt += `- [${priority}] ${task.title}`;
            if (task.dueDate) systemPrompt += ` (Due: ${dueDate})`;
            if (task.description) systemPrompt += `\n  ${task.description}`;
            systemPrompt += '\n';
          });
          systemPrompt += '\n**When asked about priorities or what to focus on, consider these tasks.**\n';
        }
      }
    } catch (error) {
      console.error('[Claude] Could not load tasks:', error);
    }

    // Build Claude CLI args
    const args = [
      '--print',                           // Non-interactive mode
      '--dangerously-skip-permissions',    // Auto-accept permissions
      '--debug',                           // Enable debug logging to see MCP issues
    ];

    // Add system prompt if exists
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }

    // Build the full message with conversation history
    let fullMessage = message;
    if (conversationHistory && conversationHistory.length > 0) {
      const historyContext = conversationHistory.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n\n');

      fullMessage = `Previous conversation:\n\n${historyContext}\n\n---\n\nCurrent message: ${message}`;
      console.log('[Claude] Including', conversationHistory.length, 'previous messages in context');
    }

    // Add the user message (with history if available)
    args.push(fullMessage);

    // Spawn Claude process with explicit environment
    console.log('[Claude] Spawning with args:', args);
    const proc = spawn('/Users/tommykeeley/.local/bin/claude', args, {
      cwd: folderPath,
      env: {
        ...process.env,
        HOME: '/Users/tommykeeley',
        USER: 'tommykeeley',
        SHELL: '/bin/zsh',
      }
    });

    // Close stdin immediately - we're not sending more input
    proc.stdin.end();

    // Handle stdout - stream character by character for typewriter effect
    let charQueue: string[] = [];
    let isStreaming = false;
    let processCompleted = false;

    const streamNextChar = () => {
      if (charQueue.length === 0) {
        isStreaming = false;
        // If process is done and queue is empty, NOW send complete event
        if (processCompleted && mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('strategize-complete');
        }
        return;
      }

      const char = charQueue.shift()!;
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('strategize-stream', char);
      }

      // Continue streaming with small delay
      setTimeout(streamNextChar, 10); // 10ms between characters
    };

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      console.log('[Claude] Output chunk:', text.substring(0, 100));

      // Add characters to queue
      charQueue.push(...text.split(''));

      // Start streaming if not already
      if (!isStreaming) {
        isStreaming = true;
        streamNextChar();
      }
    });

    // Handle stderr
    proc.stderr.on('data', (data: Buffer) => {
      const errMsg = data.toString();
      console.error('[Claude] Stderr:', errMsg);
      logStream.write(`ERROR: [Claude] Stderr: ${errMsg}\n`);
    });

    // Handle process exit
    proc.on('exit', (code: number) => {
      console.log('[Claude] Process exited with code:', code);
      logStream.write(`[Claude] Process exited with code: ${code}\n`);
      processCompleted = true;

      // Only send complete if queue is already empty and not streaming
      if (charQueue.length === 0 && !isStreaming && mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('strategize-complete');
      }
      // Otherwise, streamNextChar will send it when queue empties
    });

    // Handle spawn errors
    proc.on('error', (err: Error) => {
      console.error('[Claude] Spawn error:', err);
      logStream.write(`ERROR: [Claude] Spawn error: ${err.message}\n`);
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to send:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('strategize-stop', async () => {
  console.log('[IPC] strategize-stop called');
  // Nothing to stop - processes are one-shot
  return { success: true };
});

ipcMain.handle('strategize-reset', async () => {
  console.log('[IPC] strategize-reset called - starting new chat');

  try {
    const folderPath = store.get('strategizeFolderPath') as string;
    if (!folderPath) {
      return { success: false, error: 'No folder path set' };
    }

    // Run Claude with /clear command to reset conversation
    const proc = spawn('/Users/tommykeeley/.local/bin/claude', [
      '--print',
      '--dangerously-skip-permissions',
      '/clear'
    ], {
      cwd: folderPath,
      env: { ...process.env }
    });

    proc.on('exit', () => {
      console.log('[Claude] Conversation cleared');
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to reset:', error);
    return { success: false, error: error.message };
  }
});

// MCP OAuth completion handler
ipcMain.handle('mcp-oauth-complete', async (_event, serverName: string) => {
  console.log(`[IPC] mcp-oauth-complete called for ${serverName}`);

  try {
    const authCode = store.get(`mcpOAuth.${serverName}.authCode`) as string;
    if (!authCode) {
      return { success: false, error: 'No authorization code found' };
    }

    // The SSEClientTransport will handle the token exchange automatically
    // when we try to reconnect. Just notify the frontend that OAuth is ready.
    console.log(`[MCP OAuth] Authorization code received for ${serverName}`);

    return { success: true };
  } catch (error: any) {
    console.error(`[MCP OAuth] Failed to complete OAuth for ${serverName}:`, error);
    return { success: false, error: error.message };
  }
});

// MCP Manager IPC Handlers
ipcMain.handle('start-mcp-oauth', async (_event, serverName: string) => {
  console.log(`\n========== [IPC] START-MCP-OAUTH ==========`);
  console.log(`[IPC] Server: ${serverName}`);
  console.log(`[IPC] Timestamp: ${new Date().toISOString()}`);

  try {
    console.log(`[IPC] Checking if mcpManager exists:`, !!mcpManager);

    // Send progress update to frontend
    if (mainWindow && mainWindow.webContents) {
      console.log(`[IPC] Sending mcp-auth-progress event to frontend`);
      mainWindow.webContents.send('mcp-auth-progress', {
        serverName,
        status: 'starting',
        message: 'Connecting to MCP server...'
      });
    }

    console.log(`[IPC] Calling mcpManager.connect('${serverName}')`);

    // Connect to MCP server (will trigger OAuth if needed)
    await mcpManager.connect(serverName);

    console.log(`[MCP Manager] ✅ Connected successfully to ${serverName}`);

    // Send completion event to frontend
    if (mainWindow && mainWindow.webContents) {
      console.log(`[IPC] Sending mcp-auth-complete (success) to frontend`);
      mainWindow.webContents.send('mcp-auth-complete', {
        serverName,
        success: true,
        message: 'Authentication successful!'
      });
    }

    console.log(`[IPC] Returning success`);
    console.log(`========== [IPC] END START-MCP-OAUTH ==========\n`);
    return { success: true };
  } catch (error: any) {
    console.error(`\n❌ [MCP Manager] Connection failed for ${serverName}`);
    console.error(`[MCP Manager] Error message: ${error.message}`);
    console.error(`[MCP Manager] Error stack:`, error.stack);

    // Send error to frontend
    if (mainWindow && mainWindow.webContents) {
      console.log(`[IPC] Sending mcp-auth-complete (error) to frontend`);
      mainWindow.webContents.send('mcp-auth-complete', {
        serverName,
        success: false,
        message: error.message || 'Connection failed'
      });
    }

    console.log(`[IPC] Returning error`);
    console.log(`========== [IPC] END START-MCP-OAUTH (ERROR) ==========\n`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-mcp-auth-status', async (_event, serverName: string) => {
  console.log(`[IPC] get-mcp-auth-status called for ${serverName}`);

  try {
    const isAuthenticated = mcpManager.isAuthenticated(serverName);
    return { success: true, isAuthenticated };
  } catch (error: any) {
    console.error(`[MCP Manager] Failed to check auth status for ${serverName}:`, error);
    return { success: false, error: error.message, isAuthenticated: false };
  }
});

ipcMain.handle('get-mcp-context', async () => {
  console.log('[IPC] get-mcp-context called');

  try {
    const context = await mcpManager.getAllContextData();
    return { success: true, context };
  } catch (error: any) {
    console.error('[MCP Manager] Failed to get context:', error);
    return { success: false, error: error.message };
  }
});

// Claude Code IPC Handlers (keep for backward compatibility)
ipcMain.handle('claude-code-start', async (_event, folderPath: string) => {
  console.log('[IPC] claude-code-start called with folder:', folderPath);
  return await startClaudeCodeSession(folderPath);
});

ipcMain.handle('claude-code-send', async (_event, message: string) => {
  console.log('[IPC] claude-code-send called');
  return await sendClaudeCodeMessage(message);
});

ipcMain.handle('claude-code-stop', () => {
  console.log('[IPC] claude-code-stop called');
  return stopClaudeCodeSession();
});

ipcMain.handle('claude-code-get-history', () => {
  console.log('[IPC] claude-code-get-history called');
  return getClaudeCodeHistory();
});

ipcMain.handle('claude-code-resize', async (_event, cols: number, rows: number) => {
  try {
    if (claudeProcess && claudeProcess.resize) {
      claudeProcess.resize(cols, rows);
      console.log(`[IPC] Terminal resized to ${cols}x${rows}`);
      return { success: true };
    }
    return { success: false, error: 'No active process' };
  } catch (error: any) {
    console.error('[IPC] Failed to resize terminal:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-mcp-server', async (_event, name: string, type: 'http' | 'stdio', urlOrCommand: string) => {
  console.log(`[IPC] add-mcp-server called: ${name} (${type}) -> ${urlOrCommand}`);
  try {
    // Get strategize folder path to add MCP to that project
    const strategizeFolderPath = store.get('strategizeFolderPath') as string;
    if (!strategizeFolderPath) {
      return {
        success: false,
        error: 'No strategize folder path configured. Please set it in Settings first.'
      };
    }

    // Get user settings for Claude CLI path
    const userSettings = store.get('userSettings', {}) as any;

    // Detect Claude CLI path
    let claudePath = '/Users/tommykeeley/.local/bin/claude';
    const possiblePaths = [
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];

    if (userSettings.claudeCodePath) {
      possiblePaths.unshift(userSettings.claudeCodePath);
    }

    let foundClaude = false;
    for (const checkPath of possiblePaths) {
      try {
        if (fs.existsSync(checkPath)) {
          claudePath = checkPath;
          foundClaude = true;
          console.log('[MCP] Found Claude CLI at:', claudePath);
          break;
        }
      } catch (e) {
        // Continue checking
      }
    }

    if (!foundClaude) {
      return {
        success: false,
        error: 'Claude Code CLI not found. Please install it from https://docs.anthropic.com/en/docs/agents/claude-code'
      };
    }

    // Build command based on transport type
    // Following Amplitude docs: claude mcp add -t http -s user Amplitude "https://mcp.amplitude.com/mcp"
    let args: string[];
    if (type === 'http') {
      // For HTTP/SSE: claude mcp add -t http -s user <name> <url>
      args = ['mcp', 'add', '-t', 'http', '-s', 'user', name, urlOrCommand];
    } else {
      // For stdio: claude mcp add -s user <name> -- <command> [args...]
      // Example: claude mcp add -s user "Google Drive" -- npx -y @modelcontextprotocol/server-gdrive
      const commandParts = urlOrCommand.split(' ');
      args = ['mcp', 'add', '-s', 'user', name, '--', ...commandParts];
    }

    console.log('[MCP] Running command in', strategizeFolderPath, ':', claudePath, args.join(' '));

    return new Promise((resolve) => {
      const addProcess = spawn(claudePath, args, {
        cwd: strategizeFolderPath, // Run in project directory
        env: { ...process.env }
      });

      let output = '';
      let errorOutput = '';

      addProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      addProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      addProcess.on('exit', (code: number | null) => {
        console.log(`[MCP] claude mcp add exited with code ${code}`);
        console.log(`[MCP] stdout: ${output}`);
        if (errorOutput) console.error(`[MCP] stderr: ${errorOutput}`);

        if (code === 0) {
          console.log(`[MCP] Successfully added ${name}`);

          // For HTTP MCPs, notify user to complete OAuth in Strategize
          if (type === 'http') {
            console.log(`[MCP] ${name} configured - OAuth will happen in Strategize`);

            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('mcp-auth-complete', {
                serverName: name,
                success: true,
                message: 'MCP configured! OAuth will happen automatically when you send a Strategize message.'
              });
            }
          }

          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: `Failed to add MCP server (exit code ${code}): ${errorOutput || output}`
          });
        }
      });

      addProcess.on('error', (error: any) => {
        console.error('[MCP] Failed to spawn claude mcp add:', error);
        resolve({ success: false, error: error.message });
      });
    });
  } catch (error: any) {
    console.error('[MCP] Exception adding MCP server:', error);
    return { success: false, error: error.message };
  }
});

// Remove MCP server from Claude Code CLI
ipcMain.handle('remove-mcp-server', async (_event, name: string) => {
  console.log(`[IPC] remove-mcp-server called: ${name}`);
  try {
    // Get strategize folder path
    const strategizeFolderPath = store.get('strategizeFolderPath') as string;
    if (!strategizeFolderPath) {
      return { success: false, error: 'No strategize folder path configured' };
    }

    // Get user settings for Claude CLI path
    const userSettings = store.get('userSettings', {}) as any;

    // Detect Claude CLI path
    let claudePath = '/Users/tommykeeley/.local/bin/claude';
    const possiblePaths = [
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];

    if (userSettings.claudeCodePath) {
      possiblePaths.unshift(userSettings.claudeCodePath);
    }

    let foundClaude = false;
    for (const checkPath of possiblePaths) {
      try {
        if (fs.existsSync(checkPath)) {
          claudePath = checkPath;
          foundClaude = true;
          break;
        }
      } catch (e) {
        // Continue checking
      }
    }

    if (!foundClaude) {
      return { success: false, error: 'Claude Code CLI not found' };
    }

    // Run: claude mcp remove <name>
    const args = ['mcp', 'remove', name];
    console.log('[MCP] Running command in', strategizeFolderPath, ':', claudePath, args.join(' '));

    return new Promise((resolve) => {
      const removeProcess = spawn(claudePath, args, {
        cwd: strategizeFolderPath,
        env: { ...process.env }
      });

      let output = '';
      let errorOutput = '';

      removeProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      removeProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      removeProcess.on('exit', (code: number | null) => {
        console.log(`[MCP] claude mcp remove exited with code ${code}`);
        if (output) console.log(`[MCP] stdout: ${output}`);
        if (errorOutput) console.error(`[MCP] stderr: ${errorOutput}`);

        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: `Failed to remove MCP server (exit code ${code}): ${errorOutput || output}`
          });
        }
      });

      removeProcess.on('error', (error: any) => {
        console.error('[MCP] Failed to spawn claude mcp remove:', error);
        resolve({ success: false, error: error.message });
      });
    });
  } catch (error: any) {
    console.error('[MCP] Exception removing MCP server:', error);
    return { success: false, error: error.message };
  }
});

// Restart Strategize session (stop then notify frontend)
ipcMain.handle('strategize-restart', async () => {
  console.log('[IPC] strategize-restart called');
  try {
    const strategizeFolderPath = store.get('strategizeFolderPath') as string;
    if (!strategizeFolderPath) {
      console.log('[Strategize] No folder path set, nothing to restart');
      return { success: true };
    }

    console.log('[Strategize] Stopping current session...');

    // Send disconnect event to frontend to trigger UI reconnection
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('strategize-restart-required');
    }

    console.log('[Strategize] Restart notification sent to frontend');
    return { success: true };
  } catch (error: any) {
    console.error('[Strategize] Failed to restart:', error);
    return { success: false, error: error.message };
  }
});
