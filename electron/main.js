var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b;
import { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { IntegrationManager } from './integration-manager';
import { JiraService } from '../src/services/jira';
import { ConfluenceService } from '../src/services/confluence';
// Get __dirname equivalent in ES modules
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
// Load environment variables - handle both dev and production paths
var envPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', '.env')
    : path.join(__dirname, '..', '.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });
// Debug: Log OAuth credentials (first 20 chars only for security)
console.log('=== OAuth Configuration Debug ===');
console.log('GOOGLE_CLIENT_ID:', ((_a = process.env.GOOGLE_CLIENT_ID) === null || _a === void 0 ? void 0 : _a.substring(0, 20)) + '...');
console.log('GOOGLE_CLIENT_SECRET:', ((_b = process.env.GOOGLE_CLIENT_SECRET) === null || _b === void 0 ? void 0 : _b.substring(0, 10)) + '...');
console.log('OAUTH_REDIRECT_URI:', process.env.OAUTH_REDIRECT_URI);
console.log('================================');
var store = new Store();
var mainWindow = null;
var WINDOW_WIDTH = 400;
var WINDOW_HEIGHT = 600;
// Initialize integration manager
var integrationManager = new IntegrationManager(process.env.GOOGLE_CLIENT_ID || '', process.env.GOOGLE_CLIENT_SECRET || '', process.env.SLACK_CLIENT_ID || '', process.env.SLACK_CLIENT_SECRET || '', process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback');
// Helper function to get Jira/Confluence credentials from settings or env
function getJiraCredentials() {
    var userSettings = store.get('userSettings', {});
    return {
        domain: userSettings.jiraDomain || process.env.JIRA_DOMAIN,
        email: userSettings.jiraEmail || process.env.JIRA_EMAIL,
        apiToken: userSettings.jiraApiToken || process.env.JIRA_API_TOKEN,
    };
}
// Initialize Jira service if configured
var jiraService = null;
var jiraCredentials = getJiraCredentials();
if (jiraCredentials.domain && jiraCredentials.email && jiraCredentials.apiToken) {
    jiraService = new JiraService({
        domain: jiraCredentials.domain,
        email: jiraCredentials.email,
        apiToken: jiraCredentials.apiToken,
    });
}
// Initialize Confluence service if configured (uses same credentials as Jira)
var confluenceService = null;
if (jiraCredentials.domain && jiraCredentials.email && jiraCredentials.apiToken) {
    confluenceService = new ConfluenceService({
        domain: jiraCredentials.domain,
        email: jiraCredentials.email,
        apiToken: jiraCredentials.apiToken,
    });
}
function createWindow() {
    var _a, _b, _c;
    var primaryDisplay = screen.getPrimaryDisplay();
    var _d = primaryDisplay.workAreaSize, screenWidth = _d.width, screenHeight = _d.height;
    // Get saved position or default to right side of screen
    var savedPosition = store.get('windowPosition');
    var isPinned = (_a = savedPosition === null || savedPosition === void 0 ? void 0 : savedPosition.isPinned) !== null && _a !== void 0 ? _a : false;
    // If pinned, use full height on right side; otherwise use default dimensions
    var windowWidth = WINDOW_WIDTH;
    var windowHeight = isPinned ? screenHeight : WINDOW_HEIGHT;
    var defaultX = isPinned ? screenWidth - WINDOW_WIDTH : screenWidth - WINDOW_WIDTH - 20;
    var defaultY = isPinned ? 0 : 100;
    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: (_b = savedPosition === null || savedPosition === void 0 ? void 0 : savedPosition.x) !== null && _b !== void 0 ? _b : defaultX,
        y: (_c = savedPosition === null || savedPosition === void 0 ? void 0 : savedPosition.y) !== null && _c !== void 0 ? _c : defaultY,
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
    mainWindow.webContents.setWindowOpenHandler(function (_a) {
        var url = _a.url;
        shell.openExternal(url);
        return { action: 'deny' };
    });
    // In development, load from dev server; in production, load from file
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        // Open DevTools in development
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    // Hide instead of close
    mainWindow.on('close', function (event) {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.hide();
        }
    });
    // Save position when window is moved
    mainWindow.on('moved', function () {
        if (mainWindow) {
            var _a = mainWindow.getPosition(), x = _a[0], y = _a[1];
            var position = store.get('windowPosition');
            store.set('windowPosition', __assign(__assign({}, position), { x: x, y: y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }));
        }
    });
    // Hide window when it loses focus (optional, can be toggled)
    mainWindow.on('blur', function () {
        var hideOnBlur = store.get('hideOnBlur', false);
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
    }
    else {
        mainWindow.show();
        mainWindow.focus();
    }
}
function registerHotkey() {
    var hotkey = store.get('hotkey', 'CommandOrControl+Shift+Space');
    var success = globalShortcut.register(hotkey, function () {
        toggleWindow();
    });
    if (!success) {
        console.error('Failed to register global shortcut:', hotkey);
    }
    // Register cmd+shift+p to show window and focus task input
    // Try to unregister first in case it's already registered
    globalShortcut.unregister('CommandOrControl+Shift+P');
    var quickAddSuccess = globalShortcut.register('CommandOrControl+Shift+P', function () {
        console.log('Quick add hotkey triggered!');
        if (!mainWindow) {
            createWindow();
            // Wait for window to be ready before sending focus event
            setTimeout(function () {
                if (mainWindow) {
                    console.log('Sending focus event after window creation');
                    mainWindow.webContents.send('focus-task-input');
                }
            }, 500);
        }
        else {
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
            setTimeout(function () {
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
    }
    else {
        console.log('Successfully registered cmd+shift+p shortcut');
    }
}
// App lifecycle
app.whenReady().then(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                app.setName('PM OS');
                createWindow();
                registerHotkey();
                // Initialize integrations with stored tokens
                return [4 /*yield*/, integrationManager.initialize()];
            case 1:
                // Initialize integrations with stored tokens
                _a.sent();
                app.on('activate', function () {
                    if (BrowserWindow.getAllWindows().length === 0) {
                        createWindow();
                    }
                });
                return [2 /*return*/];
        }
    });
}); });
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('will-quit', function () {
    globalShortcut.unregisterAll();
});
app.on('before-quit', function () {
    app.isQuitting = true;
});
// IPC Handlers
ipcMain.handle('toggle-window', function () {
    toggleWindow();
});
ipcMain.handle('pin-window', function (_event, isPinned) {
    if (!mainWindow)
        return;
    var primaryDisplay = screen.getPrimaryDisplay();
    var _a = primaryDisplay.workAreaSize, screenWidth = _a.width, screenHeight = _a.height;
    if (isPinned) {
        // Pin to right side with full height
        var x = screenWidth - WINDOW_WIDTH;
        var y = 0;
        mainWindow.setResizable(true);
        mainWindow.setBounds({
            x: x,
            y: y,
            width: WINDOW_WIDTH,
            height: screenHeight
        });
        mainWindow.setResizable(false);
        mainWindow.setAlwaysOnTop(true); // Enable always-on-top when pinned
    }
    else {
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
    var position = store.get('windowPosition');
    store.set('windowPosition', __assign(__assign({}, position), { isPinned: isPinned, x: mainWindow.getPosition()[0], y: mainWindow.getPosition()[1], width: mainWindow.getSize()[0], height: mainWindow.getSize()[1] }));
});
ipcMain.handle('minimize-window', function () {
    if (mainWindow) {
        mainWindow.minimize();
    }
});
ipcMain.handle('open-external', function (_event, url) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, shell.openExternal(url)];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('get-settings', function () {
    return {
        hotkey: store.get('hotkey', 'CommandOrControl+Shift+Space'),
        syncInterval: store.get('syncInterval', 5),
        windowPosition: store.get('windowPosition'),
        hideOnBlur: store.get('hideOnBlur', false),
    };
});
ipcMain.handle('update-settings', function (_event, settings) {
    Object.keys(settings).forEach(function (key) {
        store.set(key, settings[key]);
    });
    // If hotkey changed, re-register
    if (settings.hotkey) {
        globalShortcut.unregisterAll();
        registerHotkey();
    }
});
// User Settings IPC Handlers
ipcMain.handle('get-user-settings', function () {
    return store.get('userSettings', {});
});
ipcMain.handle('save-user-settings', function (_event, settings) {
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
ipcMain.handle('get-tasks', function () {
    var tasks = store.get('tasks', []);
    return tasks;
});
ipcMain.handle('add-task', function (_event, task) {
    var tasks = store.get('tasks', []);
    var now = new Date().toISOString();
    var newTask = {
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
ipcMain.handle('update-task', function (_event, id, updates) {
    var tasks = store.get('tasks', []);
    var taskIndex = tasks.findIndex(function (t) { return t.id === id; });
    if (taskIndex !== -1) {
        tasks[taskIndex] = __assign(__assign(__assign({}, tasks[taskIndex]), updates), { updatedAt: new Date().toISOString() });
        store.set('tasks', tasks);
    }
});
ipcMain.handle('delete-task', function (_event, id) {
    var tasks = store.get('tasks', []);
    var filteredTasks = tasks.filter(function (t) { return t.id !== id; });
    store.set('tasks', filteredTasks);
});
// OAuth Handlers
ipcMain.handle('start-oauth', function (_event, provider) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, new Promise(function (resolve, reject) {
                var authWindow = new BrowserWindow({
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
                authWindow.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
                // Set additional session properties to appear more like a real browser
                authWindow.webContents.session.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
                var authUrls = {
                    google: "https://accounts.google.com/o/oauth2/v2/auth?client_id=".concat(process.env.GOOGLE_CLIENT_ID, "&redirect_uri=").concat(process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback', "&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly%20https://www.googleapis.com/auth/gmail.readonly&access_type=offline&prompt=consent"),
                    slack: "https://slack.com/oauth/v2/authorize?client_id=".concat(process.env.SLACK_CLIENT_ID, "&scope=channels:read,chat:write,users:read,im:read&redirect_uri=").concat(process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'),
                };
                authWindow.loadURL(authUrls[provider]);
                // Handle OAuth callback
                var handleOAuthCallback = function (url) { return __awaiter(void 0, void 0, void 0, function () {
                    var urlObj, code, error_1;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (!url.startsWith(process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback')) return [3 /*break*/, 8];
                                urlObj = new URL(url);
                                code = urlObj.searchParams.get('code');
                                if (!code) return [3 /*break*/, 8];
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 6, , 7]);
                                if (!(provider === 'google')) return [3 /*break*/, 3];
                                return [4 /*yield*/, integrationManager.connectGoogle(code)];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 5];
                            case 3:
                                if (!(provider === 'slack')) return [3 /*break*/, 5];
                                return [4 /*yield*/, integrationManager.connectSlack(code)];
                            case 4:
                                _a.sent();
                                _a.label = 5;
                            case 5:
                                resolve({ code: code, provider: provider, success: true });
                                return [3 /*break*/, 7];
                            case 6:
                                error_1 = _a.sent();
                                console.error("Failed to exchange ".concat(provider, " code:"), error_1);
                                resolve({ code: code, provider: provider, success: false, error: error_1 });
                                return [3 /*break*/, 7];
                            case 7:
                                authWindow === null || authWindow === void 0 ? void 0 : authWindow.close();
                                _a.label = 8;
                            case 8: return [2 /*return*/];
                        }
                    });
                }); };
                // Listen for redirect - handle both will-redirect and did-navigate
                authWindow.webContents.on('will-redirect', function (_event, url) { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, handleOAuthCallback(url)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); });
                authWindow.webContents.on('did-navigate', function (_event, url) { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, handleOAuthCallback(url)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); });
                authWindow.on('closed', function () {
                    authWindow = null;
                    reject(new Error('OAuth window closed'));
                });
            })];
    });
}); });
ipcMain.handle('get-oauth-tokens', function (_event, provider) {
    return {
        accessToken: store.get("".concat(provider, "_access_token")),
        refreshToken: store.get("".concat(provider, "_refresh_token")),
        expiresAt: store.get("".concat(provider, "_expires_at")),
    };
});
ipcMain.handle('save-oauth-tokens', function (_event, provider, tokens) {
    store.set("".concat(provider, "_access_token"), tokens.accessToken);
    if (tokens.refreshToken) {
        store.set("".concat(provider, "_refresh_token"), tokens.refreshToken);
    }
    if (tokens.expiresAt) {
        store.set("".concat(provider, "_expires_at"), tokens.expiresAt);
    }
});
// Integration sync handlers
ipcMain.handle('sync-calendar', function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, integrationManager.syncCalendar()];
            case 1: return [2 /*return*/, _a.sent()];
            case 2:
                error_2 = _a.sent();
                console.error('Failed to sync calendar:', error_2);
                return [2 /*return*/, []];
            case 3: return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('sync-gmail', function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, integrationManager.syncGmail()];
            case 1: return [2 /*return*/, _a.sent()];
            case 2:
                error_3 = _a.sent();
                console.error('Failed to sync Gmail:', error_3);
                return [2 /*return*/, []];
            case 3: return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('sync-slack', function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, integrationManager.syncSlack()];
            case 1: return [2 /*return*/, _a.sent()];
            case 2:
                error_4 = _a.sent();
                console.error('Failed to sync Slack:', error_4);
                return [2 /*return*/, []];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Smart Suggestions
ipcMain.handle('get-smart-suggestions', function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, integrationManager.getSmartSuggestions()];
            case 1: return [2 /*return*/, _a.sent()];
            case 2:
                error_5 = _a.sent();
                console.error('Failed to get smart suggestions:', error_5);
                return [2 /*return*/, []];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Jira Integration Handlers
ipcMain.handle('jira-test-connection', function () { return __awaiter(void 0, void 0, void 0, function () {
    var isConnected, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!jiraService) {
                    return [2 /*return*/, { success: false, error: 'Jira not configured' }];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, jiraService.testConnection()];
            case 2:
                isConnected = _a.sent();
                return [2 /*return*/, { success: isConnected }];
            case 3:
                error_6 = _a.sent();
                return [2 /*return*/, { success: false, error: error_6.message }];
            case 4: return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('jira-get-projects', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!jiraService)
                    throw new Error('Jira not configured');
                return [4 /*yield*/, jiraService.getProjects()];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
ipcMain.handle('jira-get-issue-types', function (_event, projectKey) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!jiraService)
                    throw new Error('Jira not configured');
                return [4 /*yield*/, jiraService.getIssueTypes(projectKey)];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
ipcMain.handle('jira-create-issue', function (_event, request) { return __awaiter(void 0, void 0, void 0, function () {
    var userSettings, issue;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!jiraService)
                    throw new Error('Jira not configured');
                userSettings = store.get('userSettings', {});
                return [4 /*yield*/, jiraService.createIssue({
                        summary: request.summary,
                        description: request.description,
                        projectKey: request.projectKey || userSettings.jiraDefaultProject || process.env.JIRA_DEFAULT_PROJECT || '',
                        issueType: request.issueType || userSettings.jiraDefaultIssueType || process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task',
                        priority: request.priority,
                    })];
            case 1:
                issue = _a.sent();
                return [2 /*return*/, {
                        key: issue.key,
                        url: jiraService.getIssueUrl(issue.key),
                    }];
        }
    });
}); });
ipcMain.handle('jira-get-my-issues', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!jiraService)
                    throw new Error('Jira not configured');
                return [4 /*yield*/, jiraService.getMyIssues()];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
ipcMain.handle('jira-is-configured', function () {
    return !!jiraService;
});
// Confluence Handlers
ipcMain.handle('confluence-is-configured', function () {
    return !!confluenceService;
});
ipcMain.handle('confluence-test-connection', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!confluenceService) {
                    return [2 /*return*/, { success: false, error: 'Confluence not configured' }];
                }
                return [4 /*yield*/, confluenceService.testConnection()];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
ipcMain.handle('confluence-get-spaces', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!confluenceService)
                    throw new Error('Confluence not configured');
                return [4 /*yield*/, confluenceService.getSpaces()];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
ipcMain.handle('confluence-create-page', function (_event, request) { return __awaiter(void 0, void 0, void 0, function () {
    var userSettings, page;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!confluenceService)
                    throw new Error('Confluence not configured');
                userSettings = store.get('userSettings', {});
                return [4 /*yield*/, confluenceService.createPage({
                        title: request.title,
                        body: request.body,
                        spaceKey: request.spaceKey || userSettings.confluenceDefaultSpace || process.env.CONFLUENCE_DEFAULT_SPACE || '',
                        parentId: request.parentId || userSettings.confluenceDefaultParentId || process.env.CONFLUENCE_DEFAULT_PARENT_ID,
                    })];
            case 1:
                page = _a.sent();
                return [2 /*return*/, {
                        id: page.id,
                        url: page.url,
                    }];
        }
    });
}); });
ipcMain.handle('confluence-search-pages', function (_event, query, spaceKey) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!confluenceService)
                    throw new Error('Confluence not configured');
                return [4 /*yield*/, confluenceService.searchPages(query, spaceKey)];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
ipcMain.handle('confluence-get-page', function (_event, pageId) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!confluenceService)
                    throw new Error('Confluence not configured');
                return [4 /*yield*/, confluenceService.getPage(pageId)];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
