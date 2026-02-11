import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { MCPSDKClient } from './mcp-sdk-client';

interface StoredMCPConfig {
  name: string;
  url: string;
  clientId?: string;
  enabled: boolean;
}

export class MCPManager {
  private clients: Map<string, MCPSDKClient> = new Map();
  private store: Store;
  private parentWindow?: BrowserWindow;

  constructor(store: Store, parentWindow?: BrowserWindow) {
    this.store = store;
    this.parentWindow = parentWindow;
  }

  /**
   * Get all MCP server configurations
   */
  public getConfigs(): Record<string, StoredMCPConfig> {
    return this.store.get('mcpServers', {}) as Record<string, StoredMCPConfig>;
  }

  /**
   * Save MCP server configuration
   */
  public saveConfig(name: string, config: StoredMCPConfig): void {
    const configs = this.getConfigs();
    configs[name] = config;
    this.store.set('mcpServers', configs);
  }

  /**
   * Get or create MCP client
   */
  public getClient(name: string): MCPSDKClient | null {
    const configs = this.getConfigs();
    const config = configs[name];

    if (!config || !config.enabled) {
      return null;
    }

    if (!this.clients.has(name)) {
      const client = new MCPSDKClient({
        name: config.name,
        url: config.url,
        store: this.store,
        parentWindow: this.parentWindow,
      });

      this.clients.set(name, client);
    }

    return this.clients.get(name)!;
  }

  /**
   * Connect to MCP server (triggers OAuth if needed)
   */
  public async connect(name: string): Promise<void> {
    console.log(`\n========== [MCP Manager] CONNECT ==========`);
    console.log(`[MCP Manager] Server name: ${name}`);
    console.log(`[MCP Manager] Getting client for ${name}...`);

    const client = this.getClient(name);

    if (!client) {
      console.error(`[MCP Manager] ❌ Client not found for ${name}`);
      console.log(`[MCP Manager] Available configs:`, Object.keys(this.getConfigs()));
      throw new Error(`MCP server ${name} not configured`);
    }

    console.log(`[MCP Manager] ✅ Client found for ${name}`);
    console.log(`[MCP Manager] Calling client.connect()...`);

    try {
      // Connect - this will automatically trigger OAuth if needed
      // The MCPSDKClient will use Electron OAuth provider to show popup
      await client.connect();

      console.log(`[MCP Manager] ✅ client.connect() completed successfully`);
      console.log(`========== [MCP Manager] CONNECT SUCCESS ==========\n`);
    } catch (error: any) {
      console.error(`[MCP Manager] ❌ client.connect() failed`);
      console.error(`[MCP Manager] Error:`, error);
      console.log(`========== [MCP Manager] CONNECT FAILED ==========\n`);
      throw error;
    }
  }

  /**
   * Check if a server is authenticated
   */
  public isAuthenticated(name: string): boolean {
    const client = this.getClient(name);
    return client ? client.isAuthenticated() : false;
  }

  /**
   * Get context data from all authenticated MCPs
   */
  public async getAllContextData(): Promise<string> {
    const contexts: string[] = [];

    for (const [name, client] of this.clients) {
      if (client.isAuthenticated()) {
        try {
          const context = await client.getContextData();
          contexts.push(context);
        } catch (error) {
          console.error(`[MCP Manager] Failed to get context for ${name}:`, error);
        }
      }
    }

    return contexts.join('\n');
  }

  /**
   * Disconnect all clients
   */
  public async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}

export default MCPManager;
