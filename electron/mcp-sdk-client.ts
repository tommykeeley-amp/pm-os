import { BrowserWindow } from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Store from 'electron-store';

// OAuth provider that uses Electron BrowserWindow
class ElectronOAuthProvider {
  private serverName: string;
  private store: Store;
  private parentWindow?: BrowserWindow;
  private onAuthCompleteCallback?: (code: string) => void;

  constructor(_serverUrl: string, serverName: string, store: Store, parentWindow?: BrowserWindow) {
    this.serverName = serverName;
    this.store = store;
    this.parentWindow = parentWindow;
  }

  setAuthCompleteCallback(callback: (code: string) => void): void {
    this.onAuthCompleteCallback = callback;
  }

  get redirectUrl(): string {
    const url = `http://localhost:3000/mcp/${this.serverName.toLowerCase()}/callback`;
    console.log(`[OAuth Provider] redirectUrl getter called: ${url}`);
    return url;
  }

  get redirect_uris(): string[] {
    const uris = [`http://localhost:3000/mcp/${this.serverName.toLowerCase()}/callback`];
    console.log(`[OAuth Provider] redirect_uris getter called:`, uris);
    return uris;
  }

  get clientMetadata(): any {
    const metadata = {
      redirect_uris: this.redirect_uris,
      scope: 'mcp:read mcp:write offline_access'
    };
    console.log(`[OAuth Provider] clientMetadata getter called:`, metadata);
    return metadata;
  }

  clientInformation(): any {
    const stored = this.store.get(`mcpOAuth.${this.serverName}.clientInfo`) as any;
    const result = stored || null;
    console.log(`[OAuth Provider] clientInformation() called:`, {
      hasStored: !!stored,
      returning: result
    });
    return result;
  }

  saveClientInformation(clientInfo: any): void {
    this.store.set(`mcpOAuth.${this.serverName}.clientInfo`, clientInfo);
    console.log(`[MCP SDK] Saved client info for ${this.serverName}`);
  }

  tokens(): any {
    const stored = this.store.get(`mcpOAuth.${this.serverName}.tokens`) as any;
    console.log(`[OAuth Provider] tokens() called:`, {
      hasTokens: !!stored,
      tokensPreview: stored ? {
        hasAccessToken: !!stored.accessToken,
        hasRefreshToken: !!stored.refreshToken,
        expiresAt: stored.expiresAt,
        isExpired: stored.expiresAt ? Date.now() > stored.expiresAt : 'unknown'
      } : 'null'
    });

    // MCP SDK expects tokens in a specific format
    // Return the tokens object directly - it should have accessToken, refreshToken, expiresAt
    return stored;
  }

  saveTokens(tokens: any): void {
    this.store.set(`mcpOAuth.${this.serverName}.tokens`, tokens);
    console.log(`[MCP SDK] Saved tokens for ${this.serverName}`);
  }

  redirectToAuthorization(authUrl: URL): void {
    console.log(`\n========== [OAuth Provider] REDIRECT TO AUTHORIZATION ==========`);
    console.log(`[OAuth Provider] Server: ${this.serverName}`);
    console.log(`[OAuth Provider] Auth URL: ${authUrl.toString()}`);
    console.log(`[OAuth Provider] Creating OAuth window...`);

    // Create OAuth window
    const oauthWindow = new BrowserWindow({
      width: 600,
      height: 800,
      parent: this.parentWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    console.log(`[OAuth Provider] ✅ OAuth window created`);
    console.log(`[OAuth Provider] Monitoring for OAuth callback...`);

    // Intercept navigation to callback URL
    oauthWindow.webContents.on('will-navigate', (_event, url) => {
      this.handleOAuthCallback(url, oauthWindow);
    });

    // Also handle redirects
    oauthWindow.webContents.on('did-navigate', (_event, url) => {
      this.handleOAuthCallback(url, oauthWindow);
    });

    // Load OAuth URL
    console.log(`[OAuth Provider] Loading OAuth URL...`);
    oauthWindow.loadURL(authUrl.toString());

    console.log(`[OAuth Provider] ✅ OAuth URL loaded`);
    console.log(`========== [OAuth Provider] REDIRECT COMPLETE ==========\n`);

    // Handle window close
    oauthWindow.on('closed', () => {
      console.log(`[OAuth Provider] OAuth window closed for ${this.serverName}`);
    });
  }

  private handleOAuthCallback(url: string, window: BrowserWindow): void {
    const callbackUrl = `http://localhost:3000/mcp/${this.serverName.toLowerCase()}/callback`;

    if (url.startsWith(callbackUrl)) {
      console.log(`[OAuth Provider] 🎯 Intercepted OAuth callback: ${url}`);

      // Extract authorization code from URL
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');

      if (code) {
        console.log(`[OAuth Provider] ✅ Got authorization code: ${code.substring(0, 10)}...`);

        // Store the authorization code - the SDK will call finishAuth() with it
        this.store.set(`mcpOAuth.${this.serverName}.authCode`, code);

        // Notify callback if set
        if (this.onAuthCompleteCallback) {
          console.log(`[OAuth Provider] Calling auth complete callback with code...`);
          this.onAuthCompleteCallback(code);
        }

        // Close the OAuth window
        setTimeout(() => {
          if (!window.isDestroyed()) {
            window.close();
          }
        }, 1000);
      } else {
        console.error(`[OAuth Provider] ❌ No authorization code in callback URL`);
      }
    }
  }

  // Note: Token exchange is now handled by MCP SDK via finishAuth()
  // This method is no longer used but kept for reference

  saveCodeVerifier(verifier: string): void {
    this.store.set(`mcpOAuth.${this.serverName}.codeVerifier`, verifier);
  }

  codeVerifier(): string {
    const stored = this.store.get(`mcpOAuth.${this.serverName}.codeVerifier`) as string;
    if (!stored) throw new Error('Code verifier not found');
    return stored;
  }
}

export interface MCPSDKClientConfig {
  name: string;
  url: string;
  store: Store;
  parentWindow?: BrowserWindow;
}

export class MCPSDKClient {
  private name: string;
  private url: string;
  private store: Store;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private oauthProvider: ElectronOAuthProvider;

  constructor(config: MCPSDKClientConfig) {
    this.name = config.name;
    this.url = config.url;
    this.store = config.store;
    this.oauthProvider = new ElectronOAuthProvider(
      config.url,
      config.name,
      config.store,
      config.parentWindow
    );
  }

  /**
   * Check if authenticated
   */
  public isAuthenticated(): boolean {
    const tokens = this.oauthProvider.tokens();
    return tokens !== null && tokens !== undefined;
  }

  /**
   * Connect to MCP server
   */
  public async connect(): Promise<void> {
    console.log(`\n========== [MCP SDK Client] CONNECT ==========`);
    console.log(`[MCP SDK] Name: ${this.name}`);
    console.log(`[MCP SDK] URL: ${this.url}`);

    // Set up callback to call finishAuth() when OAuth completes
    this.oauthProvider.setAuthCompleteCallback(async (code: string) => {
      console.log(`[MCP SDK] OAuth complete, calling transport.finishAuth()...`);
      if (this.transport) {
        try {
          const result = await this.transport.finishAuth(code);
          console.log(`[MCP SDK] ✅ finishAuth() completed successfully`);
          console.log(`[MCP SDK] finishAuth result:`, result);

          // Check if tokens were saved
          const savedTokens = this.oauthProvider.tokens();
          console.log(`[MCP SDK] Tokens after finishAuth:`, {
            hasTokens: !!savedTokens,
            tokenPreview: savedTokens ? {
              hasAccessToken: !!savedTokens.accessToken,
              hasRefreshToken: !!savedTokens.refreshToken
            } : null
          });

          console.log(`[MCP SDK] ✅ Transport is now authenticated and ready!`);
          console.log(`========== [MCP SDK Client] OAUTH COMPLETE ==========\n`);
          // No need to call connect() again - the transport is already connected and now authenticated
        } catch (error: any) {
          console.error(`[MCP SDK] ❌ finishAuth() failed:`, error.message);
          console.error(`[MCP SDK] Error stack:`, error.stack);
        }
      }
    });

    console.log(`[MCP SDK] Creating StreamableHTTPClientTransport with authProvider...`);

    try {
      // Create transport with OAuth support - using StreamableHTTP (not deprecated SSE)
      this.transport = new StreamableHTTPClientTransport(new URL(this.url), {
        authProvider: this.oauthProvider as any,
      });

      console.log(`[MCP SDK] ✅ Transport created`);
      console.log(`[MCP SDK] Creating MCP Client...`);

      // Create client
      this.client = new Client({
        name: 'pm-os',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      console.log(`[MCP SDK] ✅ Client created`);
      console.log(`[MCP SDK] Calling client.connect()...`);
      console.log(`[MCP SDK] This will trigger OAuth if needed`);

      // Connect - this will trigger OAuth if needed
      await this.client.connect(this.transport);

      console.log(`[MCP SDK] ✅ Successfully connected to ${this.name}`);
      console.log(`========== [MCP SDK Client] CONNECT SUCCESS ==========\n`);
    } catch (error: any) {
      // If Unauthorized or 401, OAuth flow should have started or needs to start
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        console.log(`[MCP SDK] Authentication required - awaiting OAuth completion...`);
        console.log(`[MCP SDK] OAuth window should be open for user to complete`);
        console.log(`========== [MCP SDK Client] AWAITING OAUTH ==========\n`);
        // Don't throw - waiting for OAuth callback
        return;
      }

      console.error(`\n❌ [MCP SDK] Connection failed`);
      console.error(`[MCP SDK] Error message: ${error.message}`);
      console.error(`[MCP SDK] Error stack:`, error.stack);
      console.log(`========== [MCP SDK Client] CONNECT FAILED ==========\n`);
      throw error;
    }
  }

  /**
   * Get available tools
   */
  public async getTools(): Promise<any[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    const result = await this.client.listTools();
    return result.tools || [];
  }

  /**
   * Call a tool
   */
  public async callTool(name: string, args: any): Promise<any> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    return await this.client.callTool({
      name,
      arguments: args,
    });
  }

  /**
   * Get context data for Strategize integration
   */
  public async getContextData(): Promise<string> {
    try {
      const tools = await this.getTools();

      let context = `\n## ${this.name} MCP Context\n\n`;
      context += `**Available Tools:**\n`;
      tools.forEach((tool: any) => {
        context += `- ${tool.name}: ${tool.description || 'No description'}\n`;
      });

      return context;
    } catch (error: any) {
      console.error(`[MCP SDK] Failed to get context data for ${this.name}:`, error);
      return `\n## ${this.name} MCP (authentication required)\n`;
    }
  }

  /**
   * Disconnect from MCP server
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.transport = null;
    console.log(`[MCP SDK] Disconnected from ${this.name}`);
  }

  /**
   * Clear authentication
   */
  public clearAuth(): void {
    this.store.delete(`mcpOAuth.${this.name}.tokens`);
    this.store.delete(`mcpOAuth.${this.name}.clientInfo`);
    this.store.delete(`mcpOAuth.${this.name}.codeVerifier`);
  }
}

export default MCPSDKClient;
