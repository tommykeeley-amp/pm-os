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
  domain: string; // e.g., yourcompany.atlassian.net
  email: string;
  apiToken: string;
}

export class JiraService {
  private config: JiraConfig;
  private baseUrl: string;

  constructor(config: JiraConfig) {
    this.config = config;
    this.baseUrl = `https://${config.domain}/rest/api/3`;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Test connection to Jira
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/myself');
      return true;
    } catch (error) {
      console.error('Jira connection test failed:', error);
      return false;
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<any> {
    return this.makeRequest('/myself');
  }

  /**
   * Get all accessible projects
   */
  async getProjects(): Promise<any[]> {
    const response = await this.makeRequest('/project/search');
    return response.values || [];
  }

  /**
   * Get issue types for a project
   */
  async getIssueTypes(projectKey: string): Promise<any[]> {
    const response = await this.makeRequest(`/project/${projectKey}`);
    return response.issueTypes || [];
  }

  /**
   * Create a Jira issue
   */
  async createIssue(request: CreateIssueRequest): Promise<JiraIssue> {
    const payload = {
      fields: {
        project: {
          key: request.projectKey,
        },
        summary: request.summary,
        description: request.description ? {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: request.description,
                },
              ],
            },
          ],
        } : undefined,
        issuetype: {
          name: request.issueType,
        },
        priority: request.priority ? {
          name: request.priority,
        } : undefined,
      },
    };

    const response = await this.makeRequest('/issue', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return this.getIssue(response.key);
  }

  /**
   * Get a specific issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.makeRequest(`/issue/${issueKey}`);
  }

  /**
   * Get issues assigned to current user
   */
  async getMyIssues(maxResults: number = 20): Promise<JiraIssue[]> {
    const jql = 'assignee = currentUser() AND status != Done ORDER BY updated DESC';
    const response = await this.makeRequest(
      `/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`
    );
    return response.issues || [];
  }

  /**
   * Get recently updated issues
   */
  async getRecentIssues(maxResults: number = 20): Promise<JiraIssue[]> {
    const jql = 'updated >= -7d ORDER BY updated DESC';
    const response = await this.makeRequest(
      `/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`
    );
    return response.issues || [];
  }

  /**
   * Update issue status
   */
  async updateIssueStatus(issueKey: string, transitionId: string): Promise<void> {
    await this.makeRequest(`/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({
        transition: {
          id: transitionId,
        },
      }),
    });
  }

  /**
   * Add comment to issue
   */
  async addComment(issueKey: string, comment: string): Promise<void> {
    await this.makeRequest(`/issue/${issueKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment,
                },
              ],
            },
          ],
        },
      }),
    });
  }

  /**
   * Get issue URL
   */
  getIssueUrl(issueKey: string): string {
    return `https://${this.config.domain}/browse/${issueKey}`;
  }
}
