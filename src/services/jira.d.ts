interface JiraIssue {
    id: string;
    key: string;
    fields: {
        summary: string;
        description?: string;
        status: {
            name: string;
        };
        assignee?: {
            displayName: string;
        };
        created: string;
        updated: string;
        priority?: {
            name: string;
        };
    };
}
interface CreateIssueRequest {
    summary: string;
    description?: string;
    projectKey: string;
    issueType: string;
    priority?: string;
}
interface JiraConfig {
    domain: string;
    email: string;
    apiToken: string;
}
export declare class JiraService {
    private config;
    private baseUrl;
    constructor(config: JiraConfig);
    private getAuthHeader;
    private makeRequest;
    /**
     * Test connection to Jira
     */
    testConnection(): Promise<boolean>;
    /**
     * Get current user info
     */
    getCurrentUser(): Promise<any>;
    /**
     * Get all accessible projects
     */
    getProjects(): Promise<any[]>;
    /**
     * Get issue types for a project
     */
    getIssueTypes(projectKey: string): Promise<any[]>;
    /**
     * Create a Jira issue
     */
    createIssue(request: CreateIssueRequest): Promise<JiraIssue>;
    /**
     * Get a specific issue by key
     */
    getIssue(issueKey: string): Promise<JiraIssue>;
    /**
     * Get issues assigned to current user
     */
    getMyIssues(maxResults?: number): Promise<JiraIssue[]>;
    /**
     * Get recently updated issues
     */
    getRecentIssues(maxResults?: number): Promise<JiraIssue[]>;
    /**
     * Update issue status
     */
    updateIssueStatus(issueKey: string, transitionId: string): Promise<void>;
    /**
     * Add comment to issue
     */
    addComment(issueKey: string, comment: string): Promise<void>;
    /**
     * Get issue URL
     */
    getIssueUrl(issueKey: string): string;
}
export {};
