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
    syncCalendar: (date?: string) => Promise<any>;
    syncGmail: () => Promise<any>;
    syncSlack: () => Promise<any>;
    getSmartSuggestions: () => Promise<any[]>;
    jiraIsConfigured: () => Promise<boolean>;
    jiraTestConnection: () => Promise<{
        success: boolean;
        error?: string;
    }>;
    jiraGetProjects: () => Promise<any[]>;
    jiraGetIssueTypes: (projectKey: string) => Promise<any[]>;
    jiraCreateIssue: (request: any) => Promise<{
        key: string;
        url: string;
    }>;
    jiraGetMyIssues: () => Promise<any[]>;
    confluenceIsConfigured: () => Promise<boolean>;
    confluenceTestConnection: () => Promise<{
        success: boolean;
        error?: string;
    }>;
    confluenceGetSpaces: () => Promise<any[]>;
    confluenceCreatePage: (request: any) => Promise<{
        id: string;
        url: string;
    }>;
    confluenceSearchPages: (query: string, spaceKey?: string) => Promise<any[]>;
    confluenceGetPage: (pageId: string) => Promise<any>;
    getUserSettings: () => Promise<any>;
    saveUserSettings: (settings: any) => Promise<void>;
    onFocusTaskInput: (callback: () => void) => () => void;
    transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; text?: string; error?: string }>;
}
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
