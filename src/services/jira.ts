import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const logFilePath = path.join(os.homedir(), 'pm-os-jira-debug.log');
function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(logFilePath, logMessage + '\n');
  console.log(message);
}

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
  async searchUserByEmail(email: string, projectKey: string): Promise<{ accountId: string; displayName: string; email: string } | null> {
    try {
      // Try assignable user search first (for finding users who can be assigned)
      logToFile(`[Jira] Trying assignable user search for email: ${email} in project: ${projectKey}`);
      const assignableResponse = await this.makeRequest(`/user/assignable/search?query=${encodeURIComponent(email)}&project=${encodeURIComponent(projectKey)}`);
      logToFile(`[Jira] Assignable search returned ${assignableResponse?.length || 0} users`);

      if (assignableResponse && assignableResponse.length > 0) {
        const exactMatch = assignableResponse.find((user: any) =>
          user.emailAddress?.toLowerCase() === email.toLowerCase()
        );

        if (exactMatch) {
          logToFile(`[Jira] Found exact email match via assignable search: ${exactMatch.displayName} (${exactMatch.accountId})`);
          return {
            accountId: exactMatch.accountId,
            displayName: exactMatch.displayName,
            email: exactMatch.emailAddress,
          };
        }
      }

      // Fall back to regular user search
      logToFile(`[Jira] Trying regular user search for email: ${email}`);
      const response = await this.makeRequest(`/user/search?query=${encodeURIComponent(email)}`);
      logToFile(`[Jira] Regular search returned ${response?.length || 0} users`);

      if (!response || response.length === 0) {
        logToFile(`[Jira] No users found with email: ${email}`);
        return null;
      }

      // Find exact email match (Jira search is fuzzy, so we need to verify)
      const exactMatch = response.find((user: any) =>
        user.emailAddress?.toLowerCase() === email.toLowerCase()
      );

      if (exactMatch) {
        logToFile(`[Jira] Found exact email match: ${exactMatch.displayName} (${exactMatch.accountId})`);
        return {
          accountId: exactMatch.accountId,
          displayName: exactMatch.displayName,
          email: exactMatch.emailAddress,
        };
      }

      logToFile(`[Jira] No exact email match for: ${email}. Found users: ${response.map((u: any) => u.emailAddress).join(', ')}`);
      return null;
    } catch (error) {
      logToFile(`[Jira] Error searching for user by email ${email}: ${error}`);
      return null;
    }
  }

  /**
   * Search for users by name (fuzzy matching)
   * Returns the best match or null if no users found
   */
  async searchUserByName(name: string, projectKey: string): Promise<{ accountId: string; displayName: string } | null> {
    try {
      logToFile(`[Jira] Calling Jira API to search for name: ${name} in project: ${projectKey}`);
      const response = await this.makeRequest(`/user/assignable/search?query=${encodeURIComponent(name)}&project=${encodeURIComponent(projectKey)}`);
      logToFile(`[Jira] Jira API returned ${response?.length || 0} users for name search`);

      if (!response || response.length === 0) {
        logToFile(`[Jira] No users found matching: ${name}`);
        return null;
      }

      // Return the first match (Jira API returns results sorted by relevance)
      const user = response[0];
      logToFile(`[Jira] Found user: ${user.displayName} (${user.accountId}) for query: ${name}`);
      return {
        accountId: user.accountId,
        displayName: user.displayName,
      };
    } catch (error) {
      logToFile(`[Jira] Error searching for user ${name}: ${error}`);
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
      logToFile(`[Jira] Searching for user by email: ${request.assigneeEmail}`);
      const user = await this.searchUserByEmail(request.assigneeEmail, request.projectKey);
      if (user) {
        assignee = { accountId: user.accountId };
        logToFile(`[Jira] Assigning issue to ${user.displayName} via email match`);
      } else {
        logToFile(`[Jira] Could not find user with email "${request.assigneeEmail}"`);
        // Fall back to name search if provided
        if (request.assigneeName) {
          logToFile(`[Jira] Falling back to name search: ${request.assigneeName}`);
          const nameUser = await this.searchUserByName(request.assigneeName, request.projectKey);
          if (nameUser) {
            assignee = { accountId: nameUser.accountId };
            logToFile(`[Jira] Assigning issue to ${nameUser.displayName} via name match`);
          }
        }
      }
    } else if (request.assigneeName) {
      logToFile(`[Jira] Searching for user by name: ${request.assigneeName}`);
      const user = await this.searchUserByName(request.assigneeName, request.projectKey);
      if (user) {
        assignee = { accountId: user.accountId };
        logToFile(`[Jira] Assigning issue to ${user.displayName}`);
      } else {
        logToFile(`[Jira] Could not find user matching "${request.assigneeName}", leaving unassigned`);
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
