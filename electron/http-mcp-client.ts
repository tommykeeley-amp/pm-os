import { EventEmitter } from 'events';
import crypto from 'crypto';

interface MCPTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPServerConfig {
  name: string;
  url: string;
  clientId?: string;
}

class HTTPMCPClient extends EventEmitter {
  private name: string;
  private tokens: MCPTokens | null = null;
  private mcpUrl: string;
  private authUrl: string = '';
  private tokenUrl: string = '';
  private clientId: string;
  private redirectUri: string;
  private eventSource: EventSource | null = null;
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = new Map();
  private requestId = 0;

  constructor(config: MCPServerConfig) {
    super();
    this.name = config.name;
    this.mcpUrl = config.url;
    this.clientId = config.clientId || 'pm-os-mcp-client';
    this.redirectUri = `http://localhost:3000/mcp/${config.name.toLowerCase()}/callback`;
  }

  /**
   * Discover OAuth endpoints from MCP server
   */
  public async discoverOAuthEndpoints(): Promise<void> {
    try {
      // Try to get OAuth metadata from well-known endpoint
      const baseUrl = new URL(this.mcpUrl).origin;
      const metadataUrl = `${baseUrl}/.well-known/oauth-authorization-server`;

      const response = await fetch(metadataUrl);
      if (response.ok) {
        const metadata = await response.json();
        this.authUrl = metadata.authorization_endpoint;
        this.tokenUrl = metadata.token_endpoint;
        console.log(`[MCP ${this.name}] Discovered OAuth endpoints:`, { authUrl: this.authUrl, tokenUrl: this.tokenUrl });
      } else {
        // Fallback to standard paths
        this.authUrl = `${baseUrl}/authorize`;
        this.tokenUrl = `${baseUrl}/token`;
        console.log(`[MCP ${this.name}] Using fallback OAuth endpoints`);
      }
    } catch (error) {
      console.error(`[MCP ${this.name}] Failed to discover OAuth endpoints:`, error);
      throw new Error(`Failed to discover OAuth endpoints for ${this.name}`);
    }
  }

  /**
   * Generate PKCE challenge
   */
  private generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return { verifier, challenge };
  }

  /**
   * Get OAuth authorization URL
   */
  public getAuthorizationUrl(): { url: string; verifier: string } {
    const { verifier, challenge } = this.generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'mcp:read mcp:write offline_access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `${this.authUrl}?${params.toString()}`,
      verifier,
    };
  }

  /**
   * Get server name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Exchange authorization code for tokens
   */
  public async exchangeCodeForTokens(code: string, verifier: string): Promise<MCPTokens> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        code_verifier: verifier,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };

    return this.tokens;
  }

  /**
   * Set tokens (for loading from storage)
   */
  public setTokens(tokens: MCPTokens): void {
    this.tokens = tokens;
  }

  /**
   * Get current tokens
   */
  public getTokens(): MCPTokens | null {
    return this.tokens;
  }

  /**
   * Check if authenticated
   */
  public isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.accessToken !== null;
  }

  /**
   * Connect to Amplitude MCP server via SSE
   */
  public async connect(): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    if (this.eventSource) {
      this.disconnect();
    }

    // For SSE with auth, we need to use a different approach since EventSource doesn't support headers
    // We'll use fetch with streaming instead
    console.log(`[MCP ${this.name}] Connecting to MCP server...`);

    const response = await fetch(this.mcpUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.tokens!.accessToken}`,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to MCP server: ${response.statusText}`);
    }

    console.log('[MCP ${this.name}] Connected to MCP server');
    this.emit('connected');

    // Handle SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const message: MCPResponse = JSON.parse(data);
                this.handleMCPResponse(message);
              } catch (e) {
                console.error('[MCP ${this.name}] Failed to parse message:', e);
              }
            }
          }
        }
      } catch (error) {
        console.error('[MCP ${this.name}] Stream error:', error);
        this.emit('error', error);
      }
    };

    processStream();
  }

  /**
   * Handle MCP response
   */
  private handleMCPResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  /**
   * Send MCP request
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    // For SSE, we need to send requests via POST to a different endpoint
    const response = await fetch(this.mcpUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.tokens!.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.result;
  }

  /**
   * Get available tools
   */
  public async getTools(): Promise<any[]> {
    return this.sendRequest('tools/list');
  }

  /**
   * Call a tool
   */
  public async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  /**
   * Get Amplitude projects (example)
   */
  public async getProjects(): Promise<any> {
    try {
      const tools = await this.getTools();
      const projectsTool = tools.find(t => t.name === 'get_projects' || t.name === 'list_projects');

      if (projectsTool) {
        return this.callTool(projectsTool.name, {});
      }

      return { error: 'Projects tool not found' };
    } catch (error: any) {
      console.error('[MCP ${this.name}] Failed to get projects:', error);
      return { error: error.message };
    }
  }

  /**
   * Disconnect from MCP server
   */
  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.pendingRequests.clear();
    console.log('[MCP ${this.name}] Disconnected');
    this.emit('disconnected');
  }

  /**
   * Clear authentication
   */
  public clearAuth(): void {
    this.disconnect();
    this.tokens = null;
  }

  /**
   * Get context data for Strategize integration
   * Returns formatted data to inject into Claude's context
   */
  public async getContextData(): Promise<string> {
    try {
      const tools = await this.getTools();
      const projects = await this.getProjects();

      let context = `\n## ${this.name} MCP Context\n\n`;
      context += `**Available Tools:**\n`;
      tools.forEach((tool: any) => {
        context += `- ${tool.name}: ${tool.description || 'No description'}\n`;
      });

      if (projects && !projects.error) {
        context += `\n**Projects:**\n`;
        if (Array.isArray(projects)) {
          projects.forEach((project: any) => {
            context += `- ${project.name || project.id}\n`;
          });
        }
      }

      return context;
    } catch (error: any) {
      console.error(`[MCP ${this.name}] Failed to get context data:`, error);
      return `\n## ${this.name} MCP (authentication required)\n`;
    }
  }
}

// Export both the class and types
export { HTTPMCPClient };
export type { MCPServerConfig, MCPTokens };
export default HTTPMCPClient;
