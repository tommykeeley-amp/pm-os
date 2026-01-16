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
  startOAuthFlow: (provider: string) => ipcRenderer.invoke('start-oauth', provider),
  getOAuthTokens: (provider: string) => ipcRenderer.invoke('get-oauth-tokens', provider),
  saveOAuthTokens: (provider: string, tokens: any) => ipcRenderer.invoke('save-oauth-tokens', provider, tokens),

  // Integrations
  syncCalendar: () => ipcRenderer.invoke('sync-calendar'),
  syncGmail: () => ipcRenderer.invoke('sync-gmail'),
  syncSlack: () => ipcRenderer.invoke('sync-slack'),
  getSmartSuggestions: () => ipcRenderer.invoke('get-smart-suggestions'),

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

  // Events
  onFocusTaskInput: (callback: () => void) => {
    ipcRenderer.on('focus-task-input', callback);
    return () => ipcRenderer.removeListener('focus-task-input', callback);
  },
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
  startOAuthFlow: (provider: string) => Promise<any>;
  getOAuthTokens: (provider: string) => Promise<any>;
  saveOAuthTokens: (provider: string, tokens: any) => Promise<void>;
  syncCalendar: () => Promise<any>;
  syncGmail: () => Promise<any>;
  syncSlack: () => Promise<any>;
  getSmartSuggestions: () => Promise<any[]>;
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
  confluenceIsConfigured: () => Promise<boolean>;
  confluenceTestConnection: () => Promise<{ success: boolean; error?: string }>;
  confluenceGetSpaces: () => Promise<any[]>;
  confluenceCreatePage: (request: any) => Promise<{ id: string; url: string }>;
  confluenceSearchPages: (query: string, spaceKey?: string) => Promise<any[]>;
  confluenceGetPage: (pageId: string) => Promise<any>;
  getUserSettings: () => Promise<any>;
  saveUserSettings: (settings: any) => Promise<void>;
  onFocusTaskInput: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
