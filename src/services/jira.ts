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
  reporterName?: string; // Optional reporter name (person who requested the ticket)
  reporterEmail?: string; // Optional reporter email (more precise than name)
  pillar?: string; // Custom field: Pillar
  pod?: string; // Custom field: Pod
  parent?: string; // Parent issue key (e.g., AMP-12345)
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
  async testConnection(): Promise<{ success: boolean; error?: string; details?: string }> {
    try {
      logToFile('[Jira] Testing connection...');
      const user = await this.makeRequest('/myself');
      logToFile(`[Jira] Connected as: ${user.displayName} (${user.emailAddress})`);

      // Also check if we can access projects
      const projects = await this.makeRequest('/project');
      logToFile(`[Jira] Found ${projects.length} accessible projects`);

      if (projects.length === 0) {
        return {
          success: false,
          error: 'No projects accessible',
          details: 'Connection successful, but your account has no access to any Jira projects. Check your permissions or API token scopes.'
        };
      }

      return { success: true };
    } catch (error: any) {
      logToFile(`[Jira] Connection test failed: ${error.message}`);

      // Parse specific error types
      if (error.message.includes('401')) {
        return {
          success: false,
          error: 'Authentication failed',
          details: 'Invalid email or API token. Please check your credentials.'
        };
      } else if (error.message.includes('404')) {
        return {
          success: false,
          error: 'Domain not found',
          details: 'The Jira domain is incorrect. Make sure it\'s in the format: yourcompany.atlassian.net'
        };
      } else if (error.message.includes('fetch')) {
        return {
          success: false,
          error: 'Network error',
          details: 'Cannot reach Jira. Check your internet connection.'
        };
      }

      return {
        success: false,
        error: 'Connection failed',
        details: error.message || 'Unknown error occurred'
      };
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
      logToFile(`[Jira] Searching for assignee by email: ${request.assigneeEmail}`);
      const user = await this.searchUserByEmail(request.assigneeEmail, request.projectKey);
      if (user) {
        assignee = { accountId: user.accountId };
        logToFile(`[Jira] Assigning issue to ${user.displayName} via email match`);
      } else {
        logToFile(`[Jira] Could not find user with email "${request.assigneeEmail}"`);
        // Fall back to name search if provided
        if (request.assigneeName) {
          logToFile(`[Jira] Falling back to assignee name search: ${request.assigneeName}`);
          const nameUser = await this.searchUserByName(request.assigneeName, request.projectKey);
          if (nameUser) {
            assignee = { accountId: nameUser.accountId };
            logToFile(`[Jira] Assigning issue to ${nameUser.displayName} via name match`);
          }
        }
      }
    } else if (request.assigneeName) {
      logToFile(`[Jira] Searching for assignee by name: ${request.assigneeName}`);
      const user = await this.searchUserByName(request.assigneeName, request.projectKey);
      if (user) {
        assignee = { accountId: user.accountId };
        logToFile(`[Jira] Assigning issue to ${user.displayName}`);
      } else {
        logToFile(`[Jira] Could not find user matching "${request.assigneeName}", leaving unassigned`);
      }
    }

    // Search for reporter - prefer email over name for precision
    let reporter = null;
    if (request.reporterEmail) {
      logToFile(`[Jira] Searching for reporter by email: ${request.reporterEmail}`);
      const user = await this.searchUserByEmail(request.reporterEmail, request.projectKey);
      if (user) {
        reporter = { accountId: user.accountId };
        logToFile(`[Jira] Setting reporter to ${user.displayName} via email match`);
      } else {
        logToFile(`[Jira] Could not find reporter with email "${request.reporterEmail}"`);
        // Fall back to name search if provided
        if (request.reporterName) {
          logToFile(`[Jira] Falling back to reporter name search: ${request.reporterName}`);
          const nameUser = await this.searchUserByName(request.reporterName, request.projectKey);
          if (nameUser) {
            reporter = { accountId: nameUser.accountId };
            logToFile(`[Jira] Setting reporter to ${nameUser.displayName} via name match`);
          }
        }
      }
    } else if (request.reporterName) {
      logToFile(`[Jira] Searching for reporter by name: ${request.reporterName}`);
      const user = await this.searchUserByName(request.reporterName, request.projectKey);
      if (user) {
        reporter = { accountId: user.accountId };
        logToFile(`[Jira] Setting reporter to ${user.displayName}`);
      } else {
        logToFile(`[Jira] Could not find reporter matching "${request.reporterName}", using default (API user)`);
      }
    }

    if (!reporter) {
      logToFile(`[Jira] No reporter specified, will use default (API user: ${this.config.email})`);
    }

    // Look up Pillar and Pod IDs from the field options
    let pillarField: { id: string } | undefined;
    let podField: { id: string } | undefined;

    if (request.pillar || request.pod) {
      const fieldOptions = await this.getPillarAndPodOptions(request.projectKey);

      if (request.pillar) {
        const pillarOption = fieldOptions.pillars.find(opt => opt.value === request.pillar);
        if (pillarOption) {
          pillarField = { id: pillarOption.id };
          logToFile(`[Jira] Found Pillar ID ${pillarOption.id} for value "${request.pillar}"`);
        } else {
          logToFile(`[Jira] Warning: Could not find Pillar option for "${request.pillar}"`);
        }
      }

      if (request.pod) {
        const podOption = fieldOptions.pods.find(opt => opt.value === request.pod);
        if (podOption) {
          podField = { id: podOption.id };
          logToFile(`[Jira] Found Pod ID ${podOption.id} for value "${request.pod}"`);
        } else {
          logToFile(`[Jira] Warning: Could not find Pod option for "${request.pod}"`);
        }
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
        reporter: reporter, // Set reporter to the person who requested the ticket
        // Parent issue
        ...(request.parent ? { parent: { key: request.parent } } : {}),
        // Custom fields - Pillar and Pod (look up IDs dynamically)
        ...(pillarField ? { customfield_11481: pillarField } : {}),
        ...(podField ? { customfield_11200: podField } : {}),
      },
    };

    logToFile(`[Jira] Creating issue with payload: ${JSON.stringify({
      projectKey: request.projectKey,
      summary: request.summary,
      issueType: request.issueType,
      priority: request.priority,
      pillar: request.pillar,
      pod: request.pod,
      parent: request.parent,
      hasAssignee: !!assignee,
      hasReporter: !!reporter,
      hasDescription: !!request.description
    })}`);

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
   * Get project components
   */
  async getComponents(projectKey: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const project = await this.makeRequest(`/project/${projectKey}`);
      return project.components || [];
    } catch (error) {
      logToFile(`[Jira] Error getting components for ${projectKey}: ${error}`);
      return [];
    }
  }

  /**
   * Get active sprints for a board
   * Note: This requires knowing the board ID. For simplicity, we search for boards in the project.
   */
  async getSprints(projectKey: string): Promise<Array<{ id: number; name: string; state: string }>> {
    try {
      // First, get boards for this project
      const boardsResponse = await this.makeRequest(`/board?projectKeyOrId=${projectKey}`);

      if (!boardsResponse.values || boardsResponse.values.length === 0) {
        return [];
      }

      // Get sprints from the first board (most projects have one board)
      const boardId = boardsResponse.values[0].id;
      const sprintsResponse = await this.makeRequest(`/board/${boardId}/sprint?state=active,future`);

      return sprintsResponse.values || [];
    } catch (error) {
      logToFile(`[Jira] Error getting sprints for ${projectKey}: ${error}`);
      return [];
    }
  }

  /**
   * Search for users assignable to a project (for autocomplete)
   */
  async searchAssignableUsers(projectKey: string, query: string): Promise<Array<{ accountId: string; displayName: string; emailAddress: string }>> {
    try {
      const response = await this.makeRequest(
        `/user/assignable/search?project=${projectKey}&query=${encodeURIComponent(query)}&maxResults=10`
      );
      return response.map((user: any) => ({
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
      }));
    } catch (error) {
      logToFile(`[Jira] Error searching assignable users: ${error}`);
      return [];
    }
  }

  /**
   * Get custom fields for issue creation metadata
   * This helps identify the correct field IDs for Pillar, Pod, etc.
   */
  async getCreateMetadata(projectKey: string, issueType: string): Promise<any> {
    try {
      const response = await this.makeRequest(
        `/issue/createmeta?projectKeys=${projectKey}&issuetypeNames=${issueType}&expand=projects.issuetypes.fields`
      );
      logToFile(`[Jira] Create metadata: ${JSON.stringify(response, null, 2)}`);
      return response;
    } catch (error) {
      logToFile(`[Jira] Error getting create metadata: ${error}`);
      return null;
    }
  }

  /**
   * Get available options for Pillar and Pod custom fields
   */
  async getPillarAndPodOptions(projectKey: string): Promise<{
    pillars: Array<{ id: string; value: string }>;
    pods: Array<{ id: string; value: string }>;
  }> {
    try {
      const metadata = await this.getCreateMetadata(projectKey, 'Task');

      if (!metadata || !metadata.projects || metadata.projects.length === 0) {
        logToFile('[Jira] No metadata found for project');
        return { pillars: [], pods: [] };
      }

      const project = metadata.projects[0];
      const issueType = project.issuetypes?.find((it: any) => it.name === 'Task');

      if (!issueType || !issueType.fields) {
        logToFile('[Jira] No fields found for Task issue type');
        return { pillars: [], pods: [] };
      }

      const fields = issueType.fields;

      // Get Pillar options (customfield_11481)
      const pillarField = fields['customfield_11481'];
      const pillars = pillarField?.allowedValues?.map((option: any) => ({
        id: option.id,
        value: option.value,
      })) || [];

      // Get Pod options (customfield_11200)
      const podField = fields['customfield_11200'];
      const pods = podField?.allowedValues?.map((option: any) => ({
        id: option.id,
        value: option.value,
      })) || [];

      logToFile(`[Jira] Found ${pillars.length} pillar options and ${pods.length} pod options`);
      return { pillars, pods };
    } catch (error) {
      logToFile(`[Jira] Error getting pillar/pod options: ${error}`);
      return { pillars: [], pods: [] };
    }
  }

  /**
   * Get issue URL
   */
  getIssueUrl(issueKey: string): string {
    return `https://${this.config.domain}/browse/${issueKey}`;
  }
}
