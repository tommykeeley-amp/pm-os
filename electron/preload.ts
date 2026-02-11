import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  toggleWindow: () => ipcRenderer.invoke('toggle-window'),
  pinWindow: (isPinned: boolean) => ipcRenderer.invoke('pin-window', isPinned),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),

  // Tasks
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (task: any) => ipcRenderer.invoke('add-task', task),
  updateTask: (id: string, updates: any) => ipcRenderer.invoke('update-task', id, updates),
  deleteTask: (id: string) => ipcRenderer.invoke('delete-task', id),

  // OAuth
  startOAuthFlow: (provider: 'google' | 'slack' | 'zoom' | 'amplitude' | 'granola' | 'clockwise') => ipcRenderer.invoke('start-oauth', provider),
  getOAuthTokens: (provider: string) => ipcRenderer.invoke('get-oauth-tokens', provider),
  saveOAuthTokens: (provider: string, tokens: any) => ipcRenderer.invoke('save-oauth-tokens', provider, tokens),

  // Integrations
  syncCalendar: () => ipcRenderer.invoke('sync-calendar'),
  syncGmail: () => ipcRenderer.invoke('sync-gmail'),
  syncSlack: () => ipcRenderer.invoke('sync-slack'),
  getSmartSuggestions: (forceRefresh?: boolean) => ipcRenderer.invoke('get-smart-suggestions', forceRefresh),
  refreshSmartSuggestions: () => ipcRenderer.invoke('refresh-smart-suggestions'),
  dismissSuggestion: (suggestionId: string) => ipcRenderer.invoke('dismiss-suggestion', suggestionId),
  writeDebugLog: (message: string) => ipcRenderer.invoke('write-debug-log', message),
  writeDebugFile: (filename: string, content: string) => ipcRenderer.invoke('write-debug-file', filename, content),

  // Calendar operations
  calendarUpdateRSVP: (eventId: string, status: string) =>
    ipcRenderer.invoke('calendar-update-rsvp', eventId, status),
  calendarCreateEvent: (request: any) =>
    ipcRenderer.invoke('calendar-create-event', request),

  // Zoom integration
  zoomIsConfigured: () =>
    ipcRenderer.invoke('zoom-is-configured'),
  zoomCreateMeeting: (request: any) =>
    ipcRenderer.invoke('zoom-create-meeting', request),

  // Jira
  jiraIsConfigured: () => ipcRenderer.invoke('jira-is-configured'),
  jiraTestConnection: () => ipcRenderer.invoke('jira-test-connection'),
  jiraGetProjects: () => ipcRenderer.invoke('jira-get-projects'),
  jiraGetIssueTypes: (projectKey: string) => ipcRenderer.invoke('jira-get-issue-types', projectKey),
  jiraCreateIssue: (request: any) => ipcRenderer.invoke('jira-create-issue', request),
  jiraGetMyIssues: () => ipcRenderer.invoke('jira-get-my-issues'),
  jiraGetComponents: (projectKey: string) => ipcRenderer.invoke('jira-get-components', projectKey),
  jiraGetSprints: (projectKey: string) => ipcRenderer.invoke('jira-get-sprints', projectKey),
  jiraSearchUsers: (projectKey: string, query: string) => ipcRenderer.invoke('jira-search-users', projectKey, query),
  jiraGetCreateMetadata: (projectKey: string, issueType: string) => ipcRenderer.invoke('jira-get-create-metadata', projectKey, issueType),
  jiraGetPillarPodOptions: (projectKey: string, issueType: string) => ipcRenderer.invoke('jira-get-pillar-pod-options', projectKey, issueType),

  // Confluence
  confluenceIsConfigured: () => ipcRenderer.invoke('confluence-is-configured'),
  confluenceTestConnection: () => ipcRenderer.invoke('confluence-test-connection'),
  confluenceGetSpaces: () => ipcRenderer.invoke('confluence-get-spaces'),
  confluenceCreatePage: (request: any) => ipcRenderer.invoke('confluence-create-page', request),
  confluenceSearchPages: (query: string, spaceKey?: string) => ipcRenderer.invoke('confluence-search-pages', query, spaceKey),
  confluenceGetPage: (pageId: string) => ipcRenderer.invoke('confluence-get-page', pageId),

  // User Settings
  getUserSettings: () => ipcRenderer.invoke('get-user-settings'),
  saveUserSettings: (settings: any) => ipcRenderer.invoke('save-user-settings', settings),

  // Generic storage
  getStoredData: (key: string) => ipcRenderer.invoke('get-stored-data', key),
  saveData: (key: string, data: any) => ipcRenderer.invoke('save-data', key, data),

  // Obsidian integration
  obsidianListNotes: () => ipcRenderer.invoke('obsidian-list-notes'),
  obsidianCreateNote: (noteData: { title: string; content: string; tags?: string[] }) =>
    ipcRenderer.invoke('obsidian-create-note', noteData),
  obsidianUpdateNote: (noteId: string, content: string) =>
    ipcRenderer.invoke('obsidian-update-note', noteId, content),
  obsidianDeleteNote: (noteId: string) =>
    ipcRenderer.invoke('obsidian-delete-note', noteId),
  obsidianOpenInApp: (noteId: string) =>
    ipcRenderer.invoke('obsidian-open-in-app', noteId),

  // Chats
  getSlackUnreadMessages: () => ipcRenderer.invoke('get-slack-unread-messages'),
  getStarredEmails: () => ipcRenderer.invoke('get-starred-emails'),
  getSlackChannels: () => ipcRenderer.invoke('get-slack-channels'),
  getSlackUsers: () => ipcRenderer.invoke('get-slack-users'),
  slackGetThreadReplies: (channelId: string, threadTs: string) =>
    ipcRenderer.invoke('slack-get-thread-replies', channelId, threadTs),
  slackSendReply: (channelId: string, threadTs: string, text: string) =>
    ipcRenderer.invoke('slack-send-reply', channelId, threadTs, text),

  // Strategize (OpenAI Chat)
  strategizeStart: (folderPath: string) =>
    ipcRenderer.invoke('strategize-start', folderPath),
  strategizeSend: (message: string) =>
    ipcRenderer.invoke('strategize-send', message),
  strategizeStop: () =>
    ipcRenderer.invoke('strategize-stop'),
  strategizeReset: () =>
    ipcRenderer.invoke('strategize-reset'),
  onStrategizeStream: (callback: (chunk: string) => void) => {
    const handler = (_event: any, chunk: string) => callback(chunk);
    ipcRenderer.on('strategize-stream', handler);
    return () => ipcRenderer.removeListener('strategize-stream', handler);
  },
  onStrategizeComplete: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('strategize-complete', handler);
    return () => ipcRenderer.removeListener('strategize-complete', handler);
  },

  // Claude Code (legacy)
  claudeCodeStart: (folderPath: string) =>
    ipcRenderer.invoke('claude-code-start', folderPath),
  claudeCodeSend: (message: string) =>
    ipcRenderer.invoke('claude-code-send', message),
  claudeCodeStop: () =>
    ipcRenderer.invoke('claude-code-stop'),
  claudeCodeGetHistory: () =>
    ipcRenderer.invoke('claude-code-get-history'),
  claudeCodeResize: (cols: number, rows: number) =>
    ipcRenderer.invoke('claude-code-resize', cols, rows),
  addMCPServer: (name: string, type: 'http' | 'stdio', urlOrCommand: string) =>
    ipcRenderer.invoke('add-mcp-server', name, type, urlOrCommand),
  onClaudeOutput: (callback: (output: string) => void) => {
    const handler = (_event: any, output: string) => callback(output);
    ipcRenderer.on('claude-output', handler);
    return () => ipcRenderer.removeListener('claude-output', handler);
  },
  onClaudeDisconnected: (callback: (data: { code: number | null; signal: string | null }) => void) => {
    const handler = (_event: any, data: { code: number | null; signal: string | null }) => callback(data);
    ipcRenderer.on('claude-disconnected', handler);
    return () => ipcRenderer.removeListener('claude-disconnected', handler);
  },
  onClaudeTerminalData: (callback: (data: string) => void) => {
    const handler = (_event: any, data: string) => callback(data);
    ipcRenderer.on('claude-terminal-data', handler);
    return () => ipcRenderer.removeListener('claude-terminal-data', handler);
  },
  onClaudeTerminalExit: (callback: (code: number | null) => void) => {
    const handler = (_event: any, code: number | null) => callback(code);
    ipcRenderer.on('claude-terminal-exit', handler);
    return () => ipcRenderer.removeListener('claude-terminal-exit', handler);
  },

  // Events
  onFocusTaskInput: (callback: () => void) => {
    ipcRenderer.on('focus-task-input', callback);
    return () => ipcRenderer.removeListener('focus-task-input', callback);
  },
  onOAuthSuccess: (callback: (data: { provider: string }) => void) => {
    ipcRenderer.on('oauth-success', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('oauth-success');
  },
  onOAuthError: (callback: (data: { error: string }) => void) => {
    ipcRenderer.on('oauth-error', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('oauth-error');
  },
  onSwitchTab: (callback: (tab: 'tasks' | 'meetings' | 'strategize' | 'chats') => void) => {
    const handler = (_event: any, tab: 'tasks' | 'meetings' | 'strategize' | 'chats') => callback(tab);
    ipcRenderer.on('switch-tab', handler);
    return () => ipcRenderer.removeListener('switch-tab', handler);
  },
  onTaskCreated: (callback: (task: any) => void) => {
    const handler = (_event: any, task: any) => callback(task);
    ipcRenderer.on('task-created', handler);
    return () => ipcRenderer.removeListener('task-created', handler);
  },
  onMCPOAuthCallback: (callback: (data: { serverName: string; code: string; state?: string }) => void) => {
    const handler = (_event: any, data: { serverName: string; code: string; state?: string }) => callback(data);
    ipcRenderer.on('mcp-oauth-callback', handler);
    return () => ipcRenderer.removeListener('mcp-oauth-callback', handler);
  },
  mcpOAuthComplete: (serverName: string) =>
    ipcRenderer.invoke('mcp-oauth-complete', serverName),
});

// Type definitions for TypeScript
export interface ElectronAPI {
  toggleWindow: () => Promise<void>;
  pinWindow: (isPinned: boolean) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<void>;
  getTasks: () => Promise<any[]>;
  addTask: (task: any) => Promise<any>;
  updateTask: (id: string, updates: any) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  startOAuthFlow: (provider: 'google' | 'slack' | 'zoom' | 'amplitude' | 'granola' | 'clockwise') => Promise<any>;
  getOAuthTokens: (provider: string) => Promise<any>;
  saveOAuthTokens: (provider: string, tokens: any) => Promise<void>;
  syncCalendar: () => Promise<any>;
  syncGmail: () => Promise<any>;
  syncSlack: () => Promise<any>;
  getSmartSuggestions: (forceRefresh?: boolean) => Promise<any[]>;
  refreshSmartSuggestions: () => Promise<any[]>;
  dismissSuggestion: (suggestionId: string) => Promise<{ success: boolean; error?: string }>;
  writeDebugLog: (message: string) => Promise<{ success: boolean; error?: string }>;
  writeDebugFile: (filename: string, content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  calendarUpdateRSVP: (eventId: string, status: string) => Promise<{ success: boolean; error?: string }>;
  calendarCreateEvent: (request: any) => Promise<{ success: boolean; event?: any; error?: string }>;
  zoomIsConfigured: () => Promise<boolean>;
  zoomCreateMeeting: (request: any) => Promise<{ success: boolean; meeting?: any; error?: string }>;
  jiraIsConfigured: () => Promise<boolean>;
  jiraTestConnection: () => Promise<{ success: boolean; error?: string }>;
  jiraGetProjects: () => Promise<any[]>;
  jiraGetIssueTypes: (projectKey: string) => Promise<any[]>;
  jiraCreateIssue: (request: any) => Promise<{ key: string; url: string }>;
  jiraGetMyIssues: () => Promise<any[]>;
  jiraGetComponents: (projectKey: string) => Promise<Array<{ id: string; name: string }>>;
  jiraGetSprints: (projectKey: string) => Promise<Array<{ id: number; name: string; state: string }>>;
  jiraSearchUsers: (projectKey: string, query: string) => Promise<Array<{ accountId: string; displayName: string; emailAddress: string }>>;
  jiraGetCreateMetadata: (projectKey: string, issueType: string) => Promise<any>;
  jiraGetPillarPodOptions: (projectKey: string, issueType: string) => Promise<{ pillars: Array<{ id: string; value: string }>; pods: Array<{ id: string; value: string }> }>;
  confluenceIsConfigured: () => Promise<boolean>;
  confluenceTestConnection: () => Promise<{ success: boolean; error?: string }>;
  confluenceGetSpaces: () => Promise<any[]>;
  confluenceCreatePage: (request: any) => Promise<{ id: string; url: string }>;
  confluenceSearchPages: (query: string, spaceKey?: string) => Promise<any[]>;
  confluenceGetPage: (pageId: string) => Promise<any>;
  getUserSettings: () => Promise<any>;
  saveUserSettings: (settings: any) => Promise<void>;
  getStoredData: (key: string) => Promise<any>;
  saveData: (key: string, data: any) => Promise<void>;
  obsidianListNotes: () => Promise<{ success: boolean; notes?: any[]; error?: string }>;
  obsidianCreateNote: (noteData: { title: string; content: string; tags?: string[] }) => Promise<{ success: boolean; note?: any; error?: string }>;
  obsidianUpdateNote: (noteId: string, content: string) => Promise<{ success: boolean; error?: string }>;
  obsidianDeleteNote: (noteId: string) => Promise<{ success: boolean; error?: string }>;
  obsidianOpenInApp: (noteId: string) => Promise<{ success: boolean; error?: string }>;
  getSlackUnreadMessages: () => Promise<any[]>;
  getStarredEmails: () => Promise<any[]>;
  getSlackChannels: () => Promise<any[]>;
  getSlackUsers: () => Promise<Array<{ id: string; name: string; realName?: string; avatar?: string }>>;
  slackGetThreadReplies: (channelId: string, threadTs: string) => Promise<Array<{text: string; user: string; userName: string; timestamp: string}>>;
  slackSendReply: (channelId: string, threadTs: string, text: string) => Promise<{success: boolean}>;
  strategizeStart: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  strategizeSend: (message: string) => Promise<{ success: boolean; error?: string }>;
  strategizeStop: () => Promise<{ success: boolean }>;
  strategizeReset: () => Promise<{ success: boolean }>;
  onStrategizeStream: (callback: (chunk: string) => void) => () => void;
  onStrategizeComplete: (callback: () => void) => () => void;
  claudeCodeStart: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  claudeCodeSend: (message: string) => Promise<{ success: boolean; error?: string }>;
  claudeCodeStop: () => Promise<{ success: boolean }>;
  claudeCodeGetHistory: () => Promise<Array<{ role: string; content: string; timestamp: string }>>;
  claudeCodeResize: (cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
  addMCPServer: (name: string, type: 'http' | 'stdio', urlOrCommand: string) => Promise<{ success: boolean; error?: string }>;
  onClaudeOutput: (callback: (output: string) => void) => () => void;
  onClaudeDisconnected: (callback: (data: { code: number | null; signal: string | null }) => void) => () => void;
  onClaudeTerminalData: (callback: (data: string) => void) => () => void;
  onClaudeTerminalExit: (callback: (code: number | null) => void) => () => void;
  onFocusTaskInput: (callback: () => void) => () => void;
  onOAuthSuccess: (callback: (data: { provider: string }) => void) => () => void;
  onOAuthError: (callback: (data: { error: string }) => void) => () => void;
  onSwitchTab: (callback: (tab: 'tasks' | 'meetings' | 'strategize' | 'chats') => void) => () => void;
  onTaskCreated: (callback: (task: any) => void) => () => void;
  onMCPOAuthCallback: (callback: (data: { serverName: string; code: string; state?: string }) => void) => () => void;
  mcpOAuthComplete: (serverName: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
