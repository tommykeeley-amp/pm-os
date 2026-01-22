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
  assigneeName?: string; // Optional assignee name to search for
  assigneeEmail?: string; // Optional assignee email (more precise than name)
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
   * Search for users by email (exact matching)
   * Returns the user or null if not found
   */
  async searchUserByEmail(email: string): Promise<{ accountId: string; displayName: string; email: string } | null> {
    try {
      const response = await this.makeRequest(`/user/search?query=${encodeURIComponent(email)}`);

      if (!response || response.length === 0) {
        console.log(`[Jira] No users found with email: ${email}`);
        return null;
      }

      // Find exact email match (Jira search is fuzzy, so we need to verify)
      const exactMatch = response.find((user: any) =>
        user.emailAddress?.toLowerCase() === email.toLowerCase()
      );

      if (exactMatch) {
        console.log(`[Jira] Found exact email match: ${exactMatch.displayName} (${exactMatch.accountId})`);
        return {
          accountId: exactMatch.accountId,
          displayName: exactMatch.displayName,
          email: exactMatch.emailAddress,
        };
      }

      console.log(`[Jira] No exact email match for: ${email}`);
      return null;
    } catch (error) {
      console.error(`[Jira] Error searching for user by email ${email}:`, error);
      return null;
    }
  }

  /**
   * Search for users by name (fuzzy matching)
   * Returns the best match or null if no users found
   */
  async searchUserByName(name: string): Promise<{ accountId: string; displayName: string } | null> {
    try {
      const response = await this.makeRequest(`/user/search?query=${encodeURIComponent(name)}`);

      if (!response || response.length === 0) {
        console.log(`[Jira] No users found matching: ${name}`);
        return null;
      }

      // Return the first match (Jira API returns results sorted by relevance)
      const user = response[0];
      console.log(`[Jira] Found user: ${user.displayName} (${user.accountId}) for query: ${name}`);
      return {
        accountId: user.accountId,
        displayName: user.displayName,
      };
    } catch (error) {
      console.error(`[Jira] Error searching for user ${name}:`, error);
      return null;
    }
  }

  /**
   * Create a Jira issue
   */
  async createIssue(request: CreateIssueRequest): Promise<JiraIssue> {
    // Search for assignee - prefer email over name for precision
    let assignee = null;
    if (request.assigneeEmail) {
      console.log(`[Jira] Searching for user by email: ${request.assigneeEmail}`);
      const user = await this.searchUserByEmail(request.assigneeEmail);
      if (user) {
        assignee = { accountId: user.accountId };
        console.log(`[Jira] Assigning issue to ${user.displayName} via email match`);
      } else {
        console.log(`[Jira] Could not find user with email "${request.assigneeEmail}"`);
        // Fall back to name search if provided
        if (request.assigneeName) {
          console.log(`[Jira] Falling back to name search: ${request.assigneeName}`);
          const nameUser = await this.searchUserByName(request.assigneeName);
          if (nameUser) {
            assignee = { accountId: nameUser.accountId };
            console.log(`[Jira] Assigning issue to ${nameUser.displayName} via name match`);
          }
        }
      }
    } else if (request.assigneeName) {
      console.log(`[Jira] Searching for user by name: ${request.assigneeName}`);
      const user = await this.searchUserByName(request.assigneeName);
      if (user) {
        assignee = { accountId: user.accountId };
        console.log(`[Jira] Assigning issue to ${user.displayName}`);
      } else {
        console.log(`[Jira] Could not find user matching "${request.assigneeName}", leaving unassigned`);
      }
    }

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
        assignee: assignee,
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
