import { contextBridge, ipcRenderer } from 'electron';
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    toggleWindow: function () { return ipcRenderer.invoke('toggle-window'); },
    pinWindow: function (isPinned) { return ipcRenderer.invoke('pin-window', isPinned); },
    minimizeWindow: function () { return ipcRenderer.invoke('minimize-window'); },
    openExternal: function (url) { return ipcRenderer.invoke('open-external', url); },
    // Settings
    getSettings: function () { return ipcRenderer.invoke('get-settings'); },
    updateSettings: function (settings) { return ipcRenderer.invoke('update-settings', settings); },
    // Tasks
    getTasks: function () { return ipcRenderer.invoke('get-tasks'); },
    addTask: function (task) { return ipcRenderer.invoke('add-task', task); },
    updateTask: function (id, updates) { return ipcRenderer.invoke('update-task', id, updates); },
    deleteTask: function (id) { return ipcRenderer.invoke('delete-task', id); },
    // OAuth
    startOAuthFlow: function (provider) { return ipcRenderer.invoke('start-oauth', provider); },
    getOAuthTokens: function (provider) { return ipcRenderer.invoke('get-oauth-tokens', provider); },
    saveOAuthTokens: function (provider, tokens) { return ipcRenderer.invoke('save-oauth-tokens', provider, tokens); },
    // Integrations
    syncCalendar: function () { return ipcRenderer.invoke('sync-calendar'); },
    syncGmail: function () { return ipcRenderer.invoke('sync-gmail'); },
    syncSlack: function () { return ipcRenderer.invoke('sync-slack'); },
    getSmartSuggestions: function () { return ipcRenderer.invoke('get-smart-suggestions'); },
    // Jira
    jiraIsConfigured: function () { return ipcRenderer.invoke('jira-is-configured'); },
    jiraTestConnection: function () { return ipcRenderer.invoke('jira-test-connection'); },
    jiraGetProjects: function () { return ipcRenderer.invoke('jira-get-projects'); },
    jiraGetIssueTypes: function (projectKey) { return ipcRenderer.invoke('jira-get-issue-types', projectKey); },
    jiraCreateIssue: function (request) { return ipcRenderer.invoke('jira-create-issue', request); },
    jiraGetMyIssues: function () { return ipcRenderer.invoke('jira-get-my-issues'); },
    // Confluence
    confluenceIsConfigured: function () { return ipcRenderer.invoke('confluence-is-configured'); },
    confluenceTestConnection: function () { return ipcRenderer.invoke('confluence-test-connection'); },
    confluenceGetSpaces: function () { return ipcRenderer.invoke('confluence-get-spaces'); },
    confluenceCreatePage: function (request) { return ipcRenderer.invoke('confluence-create-page', request); },
    confluenceSearchPages: function (query, spaceKey) { return ipcRenderer.invoke('confluence-search-pages', query, spaceKey); },
    confluenceGetPage: function (pageId) { return ipcRenderer.invoke('confluence-get-page', pageId); },
    // User Settings
    getUserSettings: function () { return ipcRenderer.invoke('get-user-settings'); },
    saveUserSettings: function (settings) { return ipcRenderer.invoke('save-user-settings', settings); },
    // Events
    onFocusTaskInput: function (callback) {
        ipcRenderer.on('focus-task-input', callback);
        return function () { return ipcRenderer.removeListener('focus-task-input', callback); };
    },
});
