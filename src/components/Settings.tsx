import { useState, useEffect } from 'react';
import SlackChannelsConfig from './SlackChannelsConfig';
import SlackDailyDigestConfig from './SlackDailyDigestConfig';
import TabPanel from './TabPanel';

interface SettingsProps {
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}

interface UserSettings {
  // Personal Info
  name?: string;
  email?: string;

  // Jira Settings
  jiraEnabled?: boolean;
  jiraDomain?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraDefaultProject?: string;
  jiraDefaultIssueType?: string;
  jiraDefaultPillar?: string;
  jiraDefaultPod?: string;
  jiraSystemPrompt?: string;

  // Confluence Settings
  confluenceDefaultSpace?: string;
  confluenceDefaultParentId?: string;
  confluenceSystemPrompt?: string;

  // Obsidian Settings
  obsidianEnabled?: boolean;
  obsidianVaultPath?: string;

  // Slack Settings
  slackBotToken?: string;
  slackMonitoredChannels?: string[]; // Channel IDs to monitor
  slackVipContacts?: string[]; // User IDs marked as VIPs
  slackDailyDigestEnabled?: boolean; // 3x daily at 9AM, 12PM, 5PM in user's timezone

  // Customization Settings
  showDeclinedMeetings?: boolean;
  primaryTimezone?: string;
  secondaryTimezone?: string;
  zoomPersonalMeetingLink?: string;

  // Strategize Settings
  strategizeFolderPath?: string;
  strategizeSystemPromptPath?: string; // Path to custom system prompt .md file
  claudeCodePath?: string; // Path to Claude Code CLI executable
  anthropicApiKey?: string; // Anthropic API key for Claude
  mcpServers?: {
    [key: string]: {
      enabled: boolean;
      command?: string;
      args?: string[];
      env?: { [key: string]: string };
      url?: string;
      transport?: 'stdio' | 'sse';
    };
  };
}

// Default Confluence system prompt
const DEFAULT_CONFLUENCE_PROMPT = 'You are creating a simple Confluence page. Your ONLY job is to capture what was actually discussed in the conversation - nothing more. DO NOT add sections like "Overview", "Purpose", "Action Items", or any structure that was not explicitly discussed. DO NOT invent objectives, goals, or requirements. Just write down what was actually said in simple, clear paragraphs. If very little was discussed, write very little. Be literal and concise.';

// Default Jira system prompt
const DEFAULT_JIRA_PROMPT = `You are extracting the core task from a message to create a Jira ticket title.

CRITICAL RULES:
1. NEVER include phrases like "create a ticket", "create jira ticket", "make a ticket" in the output
2. IGNORE all metadata like parent tickets, assignees, priorities - focus only on the actual task
3. Extract ONLY the core action/problem being described
4. Use imperative mood (e.g., "Fix bug" not "Fixing bug")
5. Keep under 80 characters
6. Be specific but concise

Examples:
- "@PM-OS create a jira ticket with parent AMP-123 and assign to @user. we can explore better ways to display long project names" → "Improve long project name display"
- "create a ticket for fixing the login bug" → "Fix login bug"
- "make a ticket to update documentation for API" → "Update API documentation"
- "I need to refactor the authentication system" → "Refactor authentication system"`;

export default function Settings({ onClose, isPinned, onTogglePin }: SettingsProps) {
  const [settings, setSettings] = useState<UserSettings>({});
  const [activeTab, setActiveTab] = useState<'personal' | 'integrations' | 'customizations'>('personal');

  // Helper to log to file that I can read
  const logToFile = async (message: string) => {
    console.log(message);
    try {
      await window.electronAPI.writeDebugLog(`[Settings] ${message}`);
    } catch (error) {
      console.error('[Settings] Failed to write to log file:', error);
    }
  };

  // Integrations state
  const [integrations, setIntegrations] = useState([
    {
      id: 'google' as const,
      name: 'Google',
      description: 'Calendar & Gmail',
      type: 'oauth' as const,
      connected: false,
    },
    {
      id: 'slack' as const,
      name: 'Slack',
      description: 'Messages & mentions',
      type: 'oauth' as const,
      connected: false,
    },
    // Zoom removed - requires OAuth app credentials
    // To re-enable: add Zoom OAuth app at marketplace.zoom.us and add ZOOM_CLIENT_ID/SECRET to Vercel
    {
      id: 'jira' as const,
      name: 'Atlassian',
      description: 'Jira tickets & Confluence pages',
      type: 'config' as const,
      connected: false,
    },
    {
      id: 'obsidian' as const,
      name: 'Obsidian',
      description: 'Create and view notes',
      type: 'config' as const,
      connected: false,
    },
  ]);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<{ provider: string; error: string } | null>(null);
  const [jiraExpanded, setJiraExpanded] = useState(false);
  const [slackExpanded, setSlackExpanded] = useState(false);
  const [obsidianExpanded, setObsidianExpanded] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; error?: string; details?: string } | null>(null);
  const [testingJira, setTestingJira] = useState(false);
  const [connectingMCP, setConnectingMCP] = useState<string | null>(null);
  const [mcpAuthProgress, setMcpAuthProgress] = useState<{ serverName: string; status: string; message: string } | null>(null);
  const [pluginStatus, setPluginStatus] = useState<{
    'document-skills': boolean;
    'amplitude-analysis': boolean;
  }>({
    'document-skills': false,
    'amplitude-analysis': false,
  });

  useEffect(() => {
    loadSettings();
    checkConnections();
    loadPluginStatus();

    // Listen for MCP auth progress events
    const handleMCPAuthProgress = (data: { serverName: string; status: string; message: string }) => {
      console.log(`[Settings] MCP auth progress for ${data.serverName}: ${data.status} - ${data.message}`);
      setMcpAuthProgress(data);
    };

    const handleMCPAuthComplete = (data: { serverName: string; success: boolean; message: string }) => {
      console.log(`[Settings] MCP auth complete for ${data.serverName}: ${data.success ? 'SUCCESS' : 'FAILED'}`);

      if (data.success) {
        setMcpAuthProgress({
          serverName: data.serverName,
          status: 'complete',
          message: data.message
        });

        // Clear progress after 3 seconds
        setTimeout(() => {
          setMcpAuthProgress(null);
          setConnectingMCP(null);
        }, 3000);
      } else {
        setConnectionError({
          provider: data.serverName.toLowerCase(),
          error: data.message
        });
        setMcpAuthProgress(null);
        setConnectingMCP(null);
      }
    };

    const cleanupMCPAuthProgress = window.electronAPI.onMCPAuthProgress?.(handleMCPAuthProgress);
    const cleanupMCPAuthComplete = window.electronAPI.onMCPAuthComplete?.(handleMCPAuthComplete);

    // Listen for OAuth success events
    const handleOAuthSuccess = async (data?: any) => {
      console.log(`\n========== [Settings] OAuth Success Event ==========`);
      console.log(`[Settings] Time: ${new Date().toISOString()}`);
      console.log(`[Settings] Event data:`, data);
      console.log(`[Settings] Provider: ${data?.provider || 'unknown'}`);
      console.log(`[Settings] ✓✓✓ OAuth flow completed successfully!`);
      console.log(`[Settings] Refreshing connection status...`);

      checkConnections();
      setIsConnecting(null);
      setConnectionError(null); // Clear any errors on success

      console.log(`[Settings] Connection status updated, user should see "Connected" now`);
      console.log(`========== [Settings] OAuth Success Handler Done ==========\n`);
    };

    const handleOAuthError = (data?: any) => {
      console.error(`\n========== [Settings] OAuth Error Event ==========`);
      console.error(`[Settings] Time: ${new Date().toISOString()}`);
      console.error(`[Settings] Event data:`, data);
      console.error(`[Settings] Current isConnecting state:`, isConnecting);

      // Only show error if we're actually in an OAuth flow
      // Ignore stale errors from previous sessions
      if (isConnecting) {
        console.error(`[Settings] ❌❌❌ OAuth flow failed`);
        console.error(`[Settings] Error: ${data?.error || 'Unknown error'}`);

        setConnectionError({
          provider: isConnecting,
          error: data?.error || 'An error occurred during OAuth flow'
        });
        setIsConnecting(null);
      } else {
        console.log(`[Settings] Ignoring stale OAuth error (not in OAuth flow)`);
      }

      console.error(`========== [Settings] OAuth Error Handler Done ==========\n`);
    };

    window.electronAPI.onOAuthSuccess?.(handleOAuthSuccess);
    window.electronAPI.onOAuthError?.(handleOAuthError);

    return () => {
      // Cleanup MCP listeners
      if (cleanupMCPAuthProgress) cleanupMCPAuthProgress();
      if (cleanupMCPAuthComplete) cleanupMCPAuthComplete();
    };
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await window.electronAPI.getUserSettings();

      // Set default Confluence prompt if not already set
      const settingsWithDefaults = {
        ...stored,
        confluenceSystemPrompt: stored?.confluenceSystemPrompt || DEFAULT_CONFLUENCE_PROMPT,
      };

      setSettings(settingsWithDefaults);

      // Save defaults if this is first time
      if (!stored?.confluenceSystemPrompt) {
        await window.electronAPI.saveUserSettings(settingsWithDefaults);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const checkConnections = async () => {
    console.log('[Settings] ========== CHECK CONNECTIONS START ==========');
    // Clear any previous connection errors
    setConnectionError(null);
    try {
      console.log('[Settings] Fetching Google tokens...');
      const googleTokens = await window.electronAPI.getOAuthTokens('google');
      console.log('[Settings] Google tokens:', {
        hasAccessToken: !!googleTokens.accessToken,
        hasRefreshToken: !!googleTokens.refreshToken,
        expiresAt: googleTokens.expiresAt,
        isExpired: googleTokens.expiresAt ? Date.now() > googleTokens.expiresAt : 'unknown'
      });

      console.log('[Settings] Fetching Slack tokens...');
      const slackTokens = await window.electronAPI.getOAuthTokens('slack');
      console.log('[Settings] Slack tokens:', {
        hasAccessToken: !!slackTokens.accessToken,
        hasRefreshToken: !!slackTokens.refreshToken,
        expiresAt: slackTokens.expiresAt
      });

      console.log('[Settings] Fetching user settings...');
      const userSettings = await window.electronAPI.getUserSettings();
      const jiraEnabled = !!userSettings?.jiraEnabled;
      const obsidianEnabled = !!userSettings?.obsidianEnabled;
      console.log('[Settings] User settings:', { jiraEnabled, obsidianEnabled });

      console.log('[Settings] Updating integration statuses...');
      setIntegrations(prev => prev.map(integration => {
        const connected = integration.id === 'google' ? !!googleTokens.accessToken :
                         integration.id === 'slack' ? !!slackTokens.accessToken :
                         integration.id === 'jira' ? jiraEnabled :
                         integration.id === 'obsidian' ? obsidianEnabled : false;
        console.log(`[Settings] ${integration.id}: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
        return { ...integration, connected };
      }));
      console.log('[Settings] ✓ Connection check complete - NO ERRORS');
    } catch (error: any) {
      console.error('[Settings] ❌ Exception in checkConnections:', error);
      console.error('[Settings] Error details:', {
        message: error.message,
        stack: error.stack
      });
      // Don't show error to user for connection checks - they're not critical
      // Just log it for debugging
    }
    console.log('[Settings] ========== CHECK CONNECTIONS END ==========');
  };

  const loadPluginStatus = async () => {
    try {
      // Check document-skills plugin
      const docSkillsResult = await window.electronAPI.checkPlugin('document-skills@anthropic-agent-skills');
      // Check amplitude-analysis plugin
      const amplitudeResult = await window.electronAPI.checkPlugin('amplitude-analysis@amplitude');

      setPluginStatus({
        'document-skills': docSkillsResult.success && docSkillsResult.enabled,
        'amplitude-analysis': amplitudeResult.success && amplitudeResult.enabled,
      });
    } catch (error) {
      console.error('Failed to load plugin status:', error);
    }
  };

  const handleChange = async (field: keyof UserSettings, value: any) => {
    const updatedSettings = { ...settings, [field]: value };
    setSettings(updatedSettings);

    // Auto-save settings
    try {
      await window.electronAPI.saveUserSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleResetConfluencePrompt = async () => {
    await handleChange('confluenceSystemPrompt', DEFAULT_CONFLUENCE_PROMPT);
  };

  const handleResetJiraPrompt = async () => {
    await handleChange('jiraSystemPrompt', DEFAULT_JIRA_PROMPT);
  };

  const handleConnect = async (integrationId: 'google' | 'slack') => {
    console.log(`\n========== [Settings] OAuth Connect Clicked ==========`);
    console.log(`[Settings] Time: ${new Date().toISOString()}`);
    console.log(`[Settings] Provider: ${integrationId}`);
    console.log(`[Settings] User action: Clicked "Connect" button`);

    setIsConnecting(integrationId);
    setConnectionError(null); // Clear any previous errors

    try {
      console.log(`[Settings] Step 1: Calling window.electronAPI.startOAuthFlow('${integrationId}')`);
      const result = await window.electronAPI.startOAuthFlow(integrationId);
      console.log(`[Settings] Step 2: Received result from main process:`, JSON.stringify(result, null, 2));

      if (result.success) {
        console.log(`[Settings] ✓ OAuth flow initiated successfully`);
        console.log(`[Settings] Waiting for browser authorization...`);
        console.log(`[Settings] After user authorizes, an 'oauth-success' event should fire`);
        // Don't mark as connected yet - wait for oauth-success event
        // The connecting state will be cleared when oauth-success event fires
      } else {
        console.error(`[Settings] ❌ OAuth flow failed to start`);
        console.error(`[Settings] Error:`, result.error);
        let errorMessage = result.error || 'Unknown error occurred';

        // Add helpful context based on the error
        if (errorMessage.includes('not configured')) {
          errorMessage += '. Please check that your .env file contains the correct OAuth credentials.';
          console.error(`[Settings] This likely means the .env file is missing or has incorrect OAuth settings`);
        } else if (errorMessage.includes('browser')) {
          errorMessage += '. Please ensure your default browser is set correctly in system settings.';
          console.error(`[Settings] The browser failed to open - check system permissions`);
        }

        console.error(`[Settings] Displaying error to user: ${errorMessage}`);
        setConnectionError({ provider: integrationId, error: errorMessage });
        setIsConnecting(null);
      }
    } catch (error: any) {
      console.error(`[Settings] ❌ Exception thrown during OAuth flow`);
      console.error(`[Settings] Error type:`, error?.constructor?.name || 'unknown');
      console.error(`[Settings] Error message:`, error?.message || String(error));
      console.error(`[Settings] Error stack:`, error?.stack || 'no stack');

      setConnectionError({
        provider: integrationId,
        error: error?.message || String(error) || 'An unexpected error occurred. Please try again.'
      });
      setIsConnecting(null);
    }

    console.log(`========== [Settings] OAuth Connect Handler Done ==========\n`);
  };

  const handleDisconnect = async (integrationId: 'google' | 'slack') => {
    try {
      await window.electronAPI.saveOAuthTokens(integrationId, {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      });

      // Also clear scope version for Google to force re-authentication with new scopes
      if (integrationId === 'google') {
        await window.electronAPI.saveData('google_oauth_scope_version', null);
      }

      setIntegrations(prev => prev.map(integration =>
        integration.id === integrationId ? { ...integration, connected: false } : integration
      ));
    } catch (error) {
      console.error(`Failed to disconnect ${integrationId}:`, error);
    }
  };

  const handleTestJiraConnection = async () => {
    setTestingJira(true);
    setJiraTestResult(null);
    try {
      const result = await window.electronAPI.jiraTestConnection();
      setJiraTestResult(result);
    } catch (error) {
      console.error('Failed to test Jira connection:', error);
      setJiraTestResult({ success: false, error: 'Failed to test connection' });
    } finally {
      setTestingJira(false);
    }
  };

  const handleMCPToggle = async (mcpProvider: 'amplitude' | 'granola' | 'clockwise' | 'atlassian' | 'pmos' | 'zoom', enable: boolean) => {
    await logToFile(`\n========== MCP TOGGLE START ==========`);
    await logToFile(`Time: ${new Date().toISOString()}`);
    await logToFile(`Provider: ${mcpProvider}`);
    await logToFile(`Action: ${enable ? 'ENABLING' : 'DISABLING'}`);
    await logToFile(`Current settings: ${JSON.stringify(settings.mcpServers?.[mcpProvider])}`);

    // Different MCPs have different setup methods
    const mcpConfig: Record<string, { name: string; type: 'http' | 'stdio'; url?: string; command?: string; args?: string[]; clientId?: string; env?: Record<string, string> }> = {
      amplitude: {
        name: 'Amplitude',
        type: 'http',
        url: 'https://mcp.amplitude.com/mcp',
        clientId: 'amplitude-mcp',
      },
      granola: {
        name: 'Granola',
        type: 'http',
        url: 'https://mcp.granola.ai/mcp',
      },
      clockwise: {
        name: 'Clockwise',
        type: 'http',
        url: 'https://mcp.getclockwise.com/mcp',
      },
      atlassian: {
        name: 'Atlassian',
        type: 'http',
        url: 'https://mcp.atlassian.com/v1/mcp',
      },
      pmos: {
        name: 'PM-OS',
        type: 'stdio',
        command: 'node',
        env: {
          PM_OS_MCP_SERVER: 'true',
        },
      },
    };

    const config = mcpConfig[mcpProvider];

    // Update settings immediately for instant UI feedback
    const mcpServers = settings.mcpServers || {};
    const mcpConfigSettings = {
      name: config.name, // Include name for MCPManager
      transport: config.type === 'stdio' ? 'stdio' : 'sse',
      enabled: enable,
      ...(config.url ? { url: config.url } : {}),
      ...(config.command ? { command: config.command } : {}),
      ...(config.clientId ? { clientId: config.clientId } : {}),
    };

    const updatedMCPServers = { ...mcpServers, [mcpProvider]: mcpConfigSettings };

    if (enable) {
      setConnectingMCP(mcpProvider);
      setConnectionError(null);
    }

    try {
      // Update settings immediately
      await logToFile(`Step 1: Updating settings...`);
      await handleChange('mcpServers', updatedMCPServers);
      await logToFile(`✓ Settings updated: MCP ${mcpProvider} ${enable ? 'enabled' : 'disabled'}`);

      if (enable) {
        // For HTTP MCPs with OAuth: first register with Claude Code, then open for authentication
        if (config.type === 'http') {
          await logToFile(`Step 2: HTTP MCP detected, registering with Claude Code...`);
          await logToFile(`MCP Details: ${JSON.stringify({ name: config.name, type: config.type, url: config.url })}`);

          // First, register the MCP server with Claude Code
          await logToFile(`Calling window.electronAPI.addMCPServer...`);
          const registerResult = await window.electronAPI.addMCPServer(
            config.name,
            'http',
            config.url || '',
            undefined // No env variables for HTTP MCPs
          );
          await logToFile(`✓ addMCPServer returned: ${JSON.stringify(registerResult)}`);

          if (!registerResult.success) {
            console.error(`[Settings] ❌ Failed to register ${config.name}:`, registerResult.error);
            setConnectionError({
              provider: mcpProvider,
              error: registerResult.error || 'Failed to register MCP server'
            });
            setConnectingMCP(null);
            return;
          }

          await logToFile(`✓ ${config.name} registered successfully`);
          await logToFile(`Step 3: Opening Terminal for authentication...`);

          // Open Terminal with Claude for interactive MCP authentication
          await logToFile(`Calling window.electronAPI.strategizeAuthenticateMCP()...`);
          const authResult = await window.electronAPI.strategizeAuthenticateMCP();
          await logToFile(`✓ strategizeAuthenticateMCP returned: ${JSON.stringify(authResult)}`);

          if (!authResult.success) {
            await logToFile(`❌ Failed to open Claude for MCP auth: ${authResult.error}`);
            setConnectionError({
              provider: mcpProvider,
              error: authResult.error || 'Failed to open authentication terminal'
            });
            setConnectingMCP(null);
            return;
          }

          // Show success message - user will complete OAuth in Terminal
          await logToFile(`✓ Terminal opened for ${config.name} authentication`);
          await logToFile(`User should now see Terminal window with Claude Code`);
          await logToFile(`User needs to type: /mcp`);
        } else {
          // For stdio MCPs: register first, then open terminal for authentication
          await logToFile(`Step 2: stdio MCP detected, registering with Claude Code...`);
          const urlOrCommand = config.url || config.command || '';
          const result = await window.electronAPI.addMCPServer(config.name, config.type, urlOrCommand, config.env);
          await logToFile(`✓ addMCPServer returned: ${JSON.stringify(result)}`);

          if (!result.success) {
            console.error(`[Settings] Failed to register MCP with Claude CLI:`, result.error);
            await logToFile(`❌ Failed to register: ${result.error}`);
            setConnectionError({
              provider: mcpProvider,
              error: result.error || 'Failed to register with Claude Code CLI'
            });
            // Revert settings
            await handleChange('mcpServers', mcpServers);
            setConnectingMCP(null);
            return;
          }

          await logToFile(`✓ ${config.name} registered successfully`);
          await logToFile(`Step 3: Opening Terminal for authentication...`);

          // Open Terminal with Claude for interactive MCP authentication
          await logToFile(`Calling window.electronAPI.strategizeAuthenticateMCP()...`);
          const authResult = await window.electronAPI.strategizeAuthenticateMCP();
          await logToFile(`✓ strategizeAuthenticateMCP returned: ${JSON.stringify(authResult)}`);

          if (!authResult.success) {
            await logToFile(`❌ Failed to open Claude for MCP auth: ${authResult.error}`);
            setConnectionError({
              provider: mcpProvider,
              error: authResult.error || 'Failed to open authentication terminal'
            });
            setConnectingMCP(null);
            return;
          }

          // Show success message - user will complete authentication in Terminal
          await logToFile(`✓ Terminal opened for ${config.name} authentication`);
          await logToFile(`User should now see Terminal window with Claude Code`);
          await logToFile(`User needs to type: /mcp`);

          // Clear connecting state since terminal is now open
          setConnectingMCP(null);
        }

        // Don't auto-restart - user will do it manually after authenticating in Terminal
      } else {
        // Disabling: for HTTP MCPs, we just disable in settings
        // For stdio MCPs, remove from Claude Code CLI
        if (config.type === 'stdio') {
          console.log(`[Settings] Removing ${config.name} from Claude Code CLI...`);
          const result = await window.electronAPI.removeMCPServer(config.name);

          if (!result.success) {
            console.warn(`[Settings] Failed to remove MCP:`, result.error);
          }
        }

        // Auto-restart Strategize session to apply removal
        console.log(`[Settings] Auto-restarting Strategize to deactivate ${config.name}...`);
        await window.electronAPI.strategizeRestart();
      }
    } catch (error: any) {
      console.error(`[Settings] Exception ${enable ? 'enabling' : 'disabling'} MCP ${mcpProvider}:`, error);
      if (enable) {
        setConnectionError({ provider: mcpProvider, error: error.message || 'Failed to enable MCP server' });
      }
    } finally {
      if (enable) {
        setConnectingMCP(null);
      }
    }
  };

  const handlePluginToggle = async (pluginName: 'document-skills' | 'amplitude-analysis') => {
    const pluginFullName = pluginName === 'document-skills'
      ? 'document-skills@anthropic-agent-skills'
      : 'amplitude-analysis@amplitude';

    try {
      // Check current plugin status
      const checkResult = await window.electronAPI.checkPlugin(pluginFullName);
      const isEnabled = checkResult.enabled;

      if (isEnabled) {
        // Disable the plugin
        console.log(`[Settings] Disabling plugin: ${pluginFullName}`);
        const result = await window.electronAPI.disablePlugin(pluginFullName);
        if (result.success) {
          alert(`${pluginName === 'document-skills' ? 'Document Skills' : 'Amplitude Analysis'} plugin disabled`);
          // Refresh plugin status
          await loadPluginStatus();
        } else {
          throw new Error(result.error || 'Failed to disable plugin');
        }
      } else {
        // Enable the plugin (install if not installed)
        console.log(`[Settings] Enabling plugin: ${pluginFullName}`);
        const result = await window.electronAPI.enablePlugin(pluginFullName);
        if (result.success) {
          alert(`${pluginName === 'document-skills' ? 'Document Skills' : 'Amplitude Analysis'} plugin enabled`);
          // Refresh plugin status
          await loadPluginStatus();
        } else {
          throw new Error(result.error || 'Failed to enable plugin');
        }
      }
    } catch (error: any) {
      console.error(`[Settings] Error toggling plugin ${pluginName}:`, error);
      alert(`Failed to toggle plugin: ${error.message}`);
    }
  };

  return (
    <div className="w-full h-full bg-dark-bg flex flex-col">
      {/* Header */}
      <div className="bg-dark-surface border-b border-dark-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button
          onClick={onClose}
          className="text-dark-text-secondary hover:text-dark-text-primary transition-colors flex items-center gap-2"
        >
          <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePin}
            className="no-drag p-1.5 hover:bg-dark-bg rounded transition-colors"
            title={isPinned ? 'Unpin window' : 'Pin to right side'}
          >
            <svg
              className={`w-4 h-4 transition-all ${
                isPinned ? 'text-dark-accent-primary -rotate-45' : 'text-dark-text-secondary'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 4v8H6v2h5v10h2V14h5v-2h-2V4H8z"
              />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="no-drag p-1.5 hover:bg-dark-bg rounded transition-colors"
            title="Minimize"
          >
            <svg
              className="w-4 h-4 text-dark-text-secondary hover:text-dark-text-primary transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 12H4"
              />
            </svg>
          </button>
        </div>
      </div>

        {/* Page Title */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-dark-text-primary">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-2 border-b border-dark-border">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'personal'
                ? 'text-dark-accent-primary border-dark-accent-primary'
                : 'text-dark-text-secondary border-transparent hover:text-dark-text-primary'
            }`}
          >
            Personal
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'integrations'
                ? 'text-dark-accent-primary border-dark-accent-primary'
                : 'text-dark-text-secondary border-transparent hover:text-dark-text-primary'
            }`}
          >
            Integrations
          </button>
          <button
            onClick={() => setActiveTab('customizations')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'customizations'
                ? 'text-dark-accent-primary border-dark-accent-primary'
                : 'text-dark-text-secondary border-transparent hover:text-dark-text-primary'
            }`}
          >
            Customizations
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Personal Tab */}
          <TabPanel isActive={activeTab === 'personal'}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={settings.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                  placeholder="Your name"
                />
                <p className="text-xs text-dark-text-muted mt-1">
                  Your name for personalization
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={settings.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                  placeholder="your.email@company.com"
                />
                <p className="text-xs text-dark-text-muted mt-1">
                  <strong>Important:</strong> Use the same email as your Slack account. This ensures Jira tickets created from Slack use YOUR credentials and show YOU as the reporter.
                </p>
              </div>
            </div>
          </TabPanel>

          {/* Integrations Tab */}
          <TabPanel isActive={activeTab === 'integrations'}>
            <div className="space-y-4">
              <p className="text-sm text-dark-text-secondary">
                Connect your accounts to get smart task suggestions from your calendar, emails, and messages.
              </p>

              {/* Connection Error Display */}
              {connectionError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-red-500 capitalize">
                        {connectionError.provider} Connection Failed
                      </h3>
                      <p className="text-sm text-dark-text-secondary mt-1">
                        {connectionError.error}
                      </p>
                      <button
                        onClick={() => setConnectionError(null)}
                        className="text-xs text-dark-accent-primary hover:text-dark-accent-secondary mt-2 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {integrations.map(integration => (
                  <div key={integration.id}>
                    <div className="bg-dark-bg border border-dark-border rounded-lg">
                      <div
                        onClick={() => {
                          if (integration.id === 'jira' && integration.connected) setJiraExpanded(!jiraExpanded);
                          if (integration.id === 'slack' && integration.connected) setSlackExpanded(!slackExpanded);
                          if (integration.id === 'obsidian' && integration.connected) setObsidianExpanded(!obsidianExpanded);
                        }}
                        className={`p-4 flex items-center justify-between ${
                          ((integration.id === 'jira' || integration.id === 'obsidian' || integration.id === 'slack') && integration.connected) ? 'cursor-pointer hover:bg-dark-surface/50 transition-colors' : ''
                        }`}
                      >
                      <div className="flex items-center gap-3">
                        <div className="text-dark-text-primary">
                          {integration.id === 'google' && (
                            <svg className="icon-md" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                          )}
                          {integration.id === 'slack' && (
                            <svg className="w-5 h-5" viewBox="0 0 127 127" fill="none" xmlns="http://www.w3.org/2000/svg">
                              {/* Top left cyan */}
                              <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80z" fill="#36C5F0"/>
                              {/* Left cyan vertical */}
                              <path d="M33.8 80c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#36C5F0"/>
                              {/* Top middle green circle */}
                              <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47z" fill="#2EB67D"/>
                              {/* Middle green vertical */}
                              <path d="M47 33.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H14c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33z" fill="#2EB67D"/>
                              {/* Right top green */}
                              <path d="M100 47c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H100V47z" fill="#ECB22E"/>
                              {/* Right middle yellow */}
                              <path d="M93.4 47c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V14c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33z" fill="#ECB22E"/>
                              {/* Bottom right red circle */}
                              <path d="M80.2 100c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V100h13.2z" fill="#E01E5A"/>
                              {/* Bottom middle red */}
                              <path d="M80.2 93.4c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2h-33z" fill="#E01E5A"/>
                            </svg>
                          )}
                          {integration.id === 'jira' && (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                              <path d="M3 19.5L9 4.5L11 9L7.5 19.5H3Z" fill="#0052CC"/>
                              <path d="M11.5 19.5L15 4.5L21 19.5H11.5Z" fill="#2684FF"/>
                            </svg>
                          )}
                          {integration.id === 'obsidian' && (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-dark-text-primary">
                            {integration.name}
                          </h3>
                          <p className="text-xs text-dark-text-muted">
                            {integration.description}
                          </p>
                        </div>
                      </div>

                      {integration.type === 'config' ? (
                        <div className="flex items-center gap-2">
                          <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (integration.id === 'jira') {
                              await handleChange('jiraEnabled', !integration.connected);
                              if (integration.connected) {
                                // Collapsing when turning off
                                setJiraExpanded(false);
                              }
                            } else if (integration.id === 'obsidian') {
                              await handleChange('obsidianEnabled', !integration.connected);
                              if (integration.connected) {
                                // Collapsing when turning off
                                setObsidianExpanded(false);
                              }
                            }
                            checkConnections();
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            integration.connected
                              ? 'bg-dark-accent-primary'
                              : 'bg-dark-border'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              integration.connected ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        {integration.connected && (
                          <svg
                            className={`icon-xs text-dark-text-secondary transition-transform ${
                              integration.id === 'jira' ? (jiraExpanded ? 'rotate-180' : '') :
                              integration.id === 'obsidian' ? (obsidianExpanded ? 'rotate-180' : '') : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                        </div>
                      ) : (
                        integration.connected ? (
                          <div className="flex items-center gap-2">
                          <span className="text-xs text-dark-accent-success flex items-center gap-1">
                            <svg className="icon-xs" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Connected
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDisconnect(integration.id as 'google' | 'slack');
                            }}
                            className="text-xs text-dark-text-muted hover:text-dark-accent-danger transition-colors"
                          >
                            Disconnect
                          </button>
                          <svg
                            className={`icon-xs text-dark-text-secondary transition-transform ${
                              integration.id === 'slack' ? (slackExpanded ? 'rotate-180' : '') : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleConnect(integration.id as 'google' | 'slack')}
                            disabled={isConnecting === integration.id}
                            className="btn-primary btn-sm"
                          >
                            {isConnecting === integration.id ? 'Connecting...' : 'Connect'}
                          </button>
                        )
                      )}
                    </div>

                    {/* Atlassian Configuration - shows when this is Jira and it's enabled and expanded */}
                    {integration.id === 'jira' && integration.connected && jiraExpanded && (
                      <div className="bg-dark-surface border border-dark-border rounded-lg p-4 mt-3">
                        <h3 className="text-sm font-medium text-dark-text-primary mb-3">Atlassian Configuration</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Jira Domain
                            </label>
                            <input
                              type="text"
                              value={settings.jiraDomain || ''}
                              onChange={(e) => handleChange('jiraDomain', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="yourcompany.atlassian.net"
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              Your Atlassian/Jira domain (without https://)
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Jira Email
                            </label>
                            <input
                              type="email"
                              value={settings.jiraEmail || ''}
                              onChange={(e) => handleChange('jiraEmail', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="your.email@company.com"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Jira API Token
                            </label>
                            <input
                              type="password"
                              value={settings.jiraApiToken || ''}
                              onChange={(e) => handleChange('jiraApiToken', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="••••••••••••••••"
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              Generate from{' '}
                              <a
                                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-dark-accent-primary hover:underline"
                              >
                                Atlassian API Tokens
                              </a>
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Default Project Key
                            </label>
                            <input
                              type="text"
                              value={settings.jiraDefaultProject || ''}
                              onChange={(e) => handleChange('jiraDefaultProject', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="PROJ"
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              Default project key for creating tickets (e.g., AMP, PROJ)
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Default Issue Type
                            </label>
                            <input
                              type="text"
                              value={settings.jiraDefaultIssueType || ''}
                              onChange={(e) => handleChange('jiraDefaultIssueType', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="Task"
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              Default issue type for creating tickets (e.g., Task, Epic, Bug)
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Default Pillar
                            </label>
                            <input
                              type="text"
                              value={settings.jiraDefaultPillar || ''}
                              onChange={(e) => handleChange('jiraDefaultPillar', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="Growth"
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              Default Pillar value for new tickets (e.g., Growth, Analytics)
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Default Pod
                            </label>
                            <input
                              type="text"
                              value={settings.jiraDefaultPod || ''}
                              onChange={(e) => handleChange('jiraDefaultPod', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                              placeholder="Growth - Retention"
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              Default Pod value for new tickets - must match a valid option in Jira
                            </p>
                          </div>

                          {/* Jira AI Settings */}
                          <div className="pt-4 border-t border-dark-border">
                            <h4 className="text-sm font-medium text-dark-text-primary mb-3">AI Settings</h4>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-dark-text-secondary">
                                  AI System Prompt for Ticket Titles
                                </label>
                                <button
                                  onClick={handleResetJiraPrompt}
                                  className="text-xs text-dark-accent-primary hover:text-dark-accent-secondary transition-colors"
                                >
                                  Reset to Default
                                </button>
                              </div>
                              <textarea
                                value={settings.jiraSystemPrompt || ''}
                                onChange={(e) => handleChange('jiraSystemPrompt', e.target.value)}
                                rows={6}
                                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                         text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary text-sm"
                                placeholder="Enter your custom system prompt..."
                              />
                              <p className="text-xs text-dark-text-muted mt-1">
                                Customize how OpenAI formats your Jira ticket titles. The AI will clean up conversational phrases and create concise, professional titles.
                              </p>
                            </div>
                          </div>

                          {/* Test Connection Button */}
                          <div className="pt-2">
                            <button
                              onClick={handleTestJiraConnection}
                              disabled={testingJira}
                              className="btn-primary btn-sm"
                            >
                              {testingJira ? 'Testing...' : 'Test Connection'}
                            </button>
                            {jiraTestResult && (
                              <div className={`mt-2 p-3 rounded-lg ${jiraTestResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                {jiraTestResult.success ? (
                                  <div className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-dark-accent-success flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <div>
                                      <div className="text-sm font-medium text-dark-accent-success">Connection successful!</div>
                                      {jiraTestResult.details && (
                                        <div className="text-xs text-dark-text-secondary mt-1">{jiraTestResult.details}</div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-dark-accent-danger flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    <div>
                                      <div className="text-sm font-medium text-dark-accent-danger">{jiraTestResult.error || 'Connection failed'}</div>
                                      {jiraTestResult.details && (
                                        <div className="text-xs text-dark-text-secondary mt-1">{jiraTestResult.details}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Confluence Settings */}
                          <div className="pt-4 border-t border-dark-border">
                            <h4 className="text-sm font-medium text-dark-text-primary mb-3">Confluence Settings</h4>
                            <p className="text-xs text-dark-text-secondary mb-3">
                              Confluence uses the same credentials as Jira configured above.
                            </p>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                                  Default Space Key
                                </label>
                                <input
                                  type="text"
                                  value={settings.confluenceDefaultSpace || ''}
                                  onChange={(e) => handleChange('confluenceDefaultSpace', e.target.value)}
                                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                                  placeholder="PA1"
                                />
                                <p className="text-xs text-dark-text-muted mt-1">
                                  Default Confluence space for creating pages
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                                  Default Parent Page ID (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={settings.confluenceDefaultParentId || ''}
                                  onChange={(e) => handleChange('confluenceDefaultParentId', e.target.value)}
                                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                                  placeholder="3526328363"
                                />
                                <p className="text-xs text-dark-text-muted mt-1">
                                  Optional parent page ID to organize new pages under a specific folder
                                </p>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <label className="text-sm font-medium text-dark-text-secondary">
                                    AI System Prompt
                                  </label>
                                  <button
                                    onClick={handleResetConfluencePrompt}
                                    className="text-xs text-dark-accent-primary hover:text-dark-accent-secondary transition-colors"
                                  >
                                    Reset to Default
                                  </button>
                                </div>
                                <textarea
                                  value={settings.confluenceSystemPrompt || ''}
                                  onChange={(e) => handleChange('confluenceSystemPrompt', e.target.value)}
                                  rows={6}
                                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary text-sm"
                                  placeholder="Enter your custom system prompt..."
                                />
                                <p className="text-xs text-dark-text-muted mt-1">
                                  Customize how OpenAI formats your Confluence pages. This is the default prompt - edit it to change the behavior.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Slack Settings - shows when this is Slack and it's connected and expanded */}
                    {integration.id === 'slack' && integration.connected && slackExpanded && (
                      <div className="bg-dark-surface border border-dark-border rounded-lg p-4 mt-3">
                        <h3 className="text-sm font-medium text-dark-text-primary mb-3">Slack Configuration</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                              Slack Bot Token (Optional)
                            </label>
                            <input
                              type="text"
                              value={settings.slackBotToken || ''}
                              onChange={(e) => handleChange('slackBotToken', e.target.value)}
                              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary font-mono text-xs"
                              placeholder="xoxb-..."
                            />
                            <p className="text-xs text-dark-text-muted mt-1">
                              For reactions and replies on Slack messages. Get your bot token from <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-dark-accent-primary hover:underline">api.slack.com/apps</a> → Your App → OAuth & Permissions → Bot User OAuth Token
                            </p>
                          </div>
                          <SlackChannelsConfig />
                          <SlackDailyDigestConfig />
                        </div>
                      </div>
                    )}

                    {/* Obsidian Vault Path - shows when this is Obsidian and it's enabled and expanded */}
                    {integration.id === 'obsidian' && integration.connected && obsidianExpanded && (
                      <div className="bg-dark-surface border border-dark-border rounded-lg p-4 mt-3">
                        <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                          Obsidian Vault Path
                        </label>
                        <input
                          type="text"
                          value={settings.obsidianVaultPath || ''}
                          onChange={(e) => handleChange('obsidianVaultPath', e.target.value)}
                          className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                   text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                          placeholder="/Users/yourname/Documents/ObsidianVault"
                        />
                        <p className="text-xs text-dark-text-muted mt-1">
                          Full path to your Obsidian vault folder. To find it: Open Obsidian → Settings (gear icon) → Files & Links → look for "Vault folder" path.
                        </p>
                      </div>
                    )}
                    </div>
                  </div>
                ))}

              </div>

              <div className="pt-4 border-t border-dark-border">
                <p className="text-xs text-dark-text-muted">
                  Your credentials are stored securely on your device and never sent to external servers.
                </p>
              </div>
            </div>
          </TabPanel>

          {/* Customizations Tab */}
          <TabPanel isActive={activeTab === 'customizations'}>
            <div className="space-y-4 pb-8">
              <p className="text-sm text-dark-text-secondary">
                Customize how PM-OS displays information.
              </p>

              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-dark-text-primary">
                      Show Declined Meetings
                    </h3>
                    <p className="text-xs text-dark-text-muted mt-1">
                      Display meetings you've declined in the Meetings tab
                    </p>
                  </div>
                  <button
                    onClick={() => handleChange('showDeclinedMeetings', !(settings.showDeclinedMeetings ?? true))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showDeclinedMeetings !== false
                        ? 'bg-dark-accent-primary'
                        : 'bg-dark-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.showDeclinedMeetings !== false ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-dark-border">
                <h3 className="text-base font-semibold text-dark-text-primary">Timezone Settings</h3>

                <div>
                  <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                    Primary Timezone
                  </label>
                  <select
                    value={settings.primaryTimezone || 'America/Los_Angeles'}
                    onChange={(e) => handleChange('primaryTimezone', e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-dark-bg border border-dark-border rounded-lg
                             text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                  >
                    <optgroup label="Suggested">
                      <option value="America/New_York">Eastern Time (EST/EDT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                    </optgroup>
                    <optgroup label="North America">
                      <option value="America/New_York">Eastern Time (EST/EDT)</option>
                      <option value="America/Chicago">Central Time (CST/CDT)</option>
                      <option value="America/Denver">Mountain Time (MST/MDT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                      <option value="America/Anchorage">Alaska Time (AKST/AKDT)</option>
                      <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Central European (CET/CEST)</option>
                      <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                      <option value="Europe/Madrid">Madrid (CET/CEST)</option>
                      <option value="Europe/Rome">Rome (CET/CEST)</option>
                      <option value="Europe/Athens">Athens (EET/EEST)</option>
                    </optgroup>
                    <optgroup label="Asia">
                      <option value="Asia/Dubai">Dubai (GST)</option>
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="Asia/Shanghai">China (CST)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                      <option value="Asia/Seoul">Seoul (KST)</option>
                      <option value="Asia/Singapore">Singapore (SGT)</option>
                      <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                    </optgroup>
                    <optgroup label="Australia">
                      <option value="Australia/Sydney">Sydney (AEDT/AEST)</option>
                      <option value="Australia/Melbourne">Melbourne (AEDT/AEST)</option>
                      <option value="Australia/Brisbane">Brisbane (AEST)</option>
                      <option value="Australia/Perth">Perth (AWST)</option>
                    </optgroup>
                  </select>
                  <p className="text-xs text-dark-text-muted mt-1">
                    Main timezone displayed in the Meetings tab
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                    Secondary Timezone
                  </label>
                  <select
                    value={settings.secondaryTimezone || 'America/New_York'}
                    onChange={(e) => handleChange('secondaryTimezone', e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-dark-bg border border-dark-border rounded-lg
                             text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                  >
                    <optgroup label="Suggested">
                      <option value="America/New_York">Eastern Time (EST/EDT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                    </optgroup>
                    <optgroup label="North America">
                      <option value="America/New_York">Eastern Time (EST/EDT)</option>
                      <option value="America/Chicago">Central Time (CST/CDT)</option>
                      <option value="America/Denver">Mountain Time (MST/MDT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                      <option value="America/Anchorage">Alaska Time (AKST/AKDT)</option>
                      <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Central European (CET/CEST)</option>
                      <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                      <option value="Europe/Madrid">Madrid (CET/CEST)</option>
                      <option value="Europe/Rome">Rome (CET/CEST)</option>
                      <option value="Europe/Athens">Athens (EET/EEST)</option>
                    </optgroup>
                    <optgroup label="Asia">
                      <option value="Asia/Dubai">Dubai (GST)</option>
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="Asia/Shanghai">China (CST)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                      <option value="Asia/Seoul">Seoul (KST)</option>
                      <option value="Asia/Singapore">Singapore (SGT)</option>
                      <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                    </optgroup>
                    <optgroup label="Australia">
                      <option value="Australia/Sydney">Sydney (AEDT/AEST)</option>
                      <option value="Australia/Melbourne">Melbourne (AEDT/AEST)</option>
                      <option value="Australia/Brisbane">Brisbane (AEST)</option>
                      <option value="Australia/Perth">Perth (AWST)</option>
                    </optgroup>
                  </select>
                  <p className="text-xs text-dark-text-muted mt-1">
                    Timezone shown on hover in the Meetings tab
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-dark-border">
                <h3 className="text-base font-semibold text-dark-text-primary">Video Meetings</h3>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                    Personal Zoom Meeting Link
                  </label>
                  <input
                    type="text"
                    value={settings.zoomPersonalMeetingLink || ''}
                    onChange={(e) => handleChange('zoomPersonalMeetingLink', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                             text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                    placeholder="https://zoom.us/j/your-meeting-id"
                  />
                  <p className="text-xs text-dark-text-muted mt-1">
                    Your permanent Zoom meeting link (found in Zoom settings under Personal Meeting ID)
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-dark-border">
                <h3 className="text-base font-semibold text-dark-text-primary">Strategize Configuration</h3>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                    Project Folder Path
                  </label>
                  <input
                    type="text"
                    value={settings.strategizeFolderPath || ''}
                    onChange={(e) => handleChange('strategizeFolderPath', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                             text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                    placeholder="/Users/yourname/Documents/ProjectFolder"
                  />
                  <p className="text-xs text-dark-text-muted mt-1">
                    Full path to the folder where Claude Code will provide strategic context and analysis
                  </p>
                </div>

                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                    System Prompt File (Optional)
                  </label>
                  <input
                    type="text"
                    value={settings.strategizeSystemPromptPath || ''}
                    onChange={(e) => handleChange('strategizeSystemPromptPath', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                             text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                    placeholder="/Users/yourname/Documents/strategize-prompt.md"
                  />
                  <p className="text-xs text-dark-text-muted mt-1">
                    Path to a .md file with custom instructions for the AI (e.g., "Keep responses under 1000 characters")
                  </p>
                </div>

                {/* MCP Servers Configuration */}
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-dark-text-primary">MCP Servers</h4>
                      <p className="text-xs text-dark-text-muted mt-1">
                        Enable Model Context Protocol servers for enhanced capabilities
                      </p>
                    </div>
                  </div>

                  {/* Amplitude MCP */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-dark-text-primary">Amplitude</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const isCurrentlyEnabled = settings.mcpServers?.amplitude?.enabled;
                          handleMCPToggle('amplitude', !isCurrentlyEnabled);
                        }}
                        disabled={connectingMCP === 'amplitude'}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.mcpServers?.amplitude?.enabled
                            ? 'bg-dark-accent-primary'
                            : 'bg-dark-border'
                        } ${connectingMCP === 'amplitude' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.mcpServers?.amplitude?.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {(connectingMCP === 'amplitude' || (mcpAuthProgress?.serverName.toLowerCase() === 'amplitude')) && (
                      <div className="text-xs text-dark-text-muted">
                        <div className={`flex items-center gap-2 p-2 rounded border ${
                          mcpAuthProgress?.status === 'complete' || mcpAuthProgress?.status === 'ready'
                            ? 'bg-green-500/10 border-green-500/30'
                            : 'bg-blue-500/10 border-blue-500/30'
                        }`}>
                          {(mcpAuthProgress?.status === 'complete' || mcpAuthProgress?.status === 'ready') ? (
                            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                          <span>{mcpAuthProgress?.message || 'Configuring MCP server...'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Granola MCP */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-dark-text-primary">Granola</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const isCurrentlyEnabled = settings.mcpServers?.granola?.enabled;
                          handleMCPToggle('granola', !isCurrentlyEnabled);
                        }}
                        disabled={connectingMCP === 'granola'}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.mcpServers?.granola?.enabled
                            ? 'bg-dark-accent-primary'
                            : 'bg-dark-border'
                        } ${connectingMCP === 'granola' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.mcpServers?.granola?.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {connectingMCP === 'granola' && (
                      <div className="text-xs text-dark-text-muted">
                        <div className="flex items-center gap-2 p-2 bg-purple-500/10 border border-purple-500/30 rounded">
                          <svg className="animate-spin h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Enabling MCP server...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clockwise MCP */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-green-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-dark-text-primary">Clockwise</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const isCurrentlyEnabled = settings.mcpServers?.clockwise?.enabled;
                          handleMCPToggle('clockwise', !isCurrentlyEnabled);
                        }}
                        disabled={connectingMCP === 'clockwise'}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.mcpServers?.clockwise?.enabled
                            ? 'bg-dark-accent-primary'
                            : 'bg-dark-border'
                        } ${connectingMCP === 'clockwise' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.mcpServers?.clockwise?.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {connectingMCP === 'clockwise' && (
                      <div className="text-xs text-dark-text-muted">
                        <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
                          <svg className="animate-spin h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Enabling MCP server...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Atlassian MCP */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-dark-text-primary">Atlassian</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const isCurrentlyEnabled = settings.mcpServers?.atlassian?.enabled;
                          handleMCPToggle('atlassian', !isCurrentlyEnabled);
                        }}
                        disabled={connectingMCP === 'atlassian'}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.mcpServers?.atlassian?.enabled
                            ? 'bg-dark-accent-primary'
                            : 'bg-dark-border'
                        } ${connectingMCP === 'atlassian' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.mcpServers?.atlassian?.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {connectingMCP === 'atlassian' && (
                      <div className="text-xs text-dark-text-muted">
                        <div className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded">
                          <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Enabling MCP server...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PM-OS MCP */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-orange-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-dark-text-primary">PM-OS</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const isCurrentlyEnabled = settings.mcpServers?.pmos?.enabled;
                          handleMCPToggle('pmos', !isCurrentlyEnabled);
                        }}
                        disabled={connectingMCP === 'pmos'}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.mcpServers?.pmos?.enabled
                            ? 'bg-dark-accent-primary'
                            : 'bg-dark-border'
                        } ${connectingMCP === 'pmos' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.mcpServers?.pmos?.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {connectingMCP === 'pmos' && (
                      <div className="text-xs text-dark-text-muted">
                        <div className="flex items-center gap-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded">
                          <svg className="animate-spin h-4 w-4 text-orange-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Enabling MCP server...</span>
                        </div>
                      </div>
                    )}
                  </div>


                </div>

                {/* Claude Plugins Configuration */}
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-dark-text-primary">Claude Plugins</h4>
                      <p className="text-xs text-dark-text-muted mt-1">
                        Enable Claude Code plugins for document creation and analytics
                      </p>
                    </div>
                  </div>

                  {/* Document Skills Plugin */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-dark-text-primary">Document Skills</div>
                          <div className="text-xs text-dark-text-muted">Create Word, PDF, PowerPoint, and Excel files</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePluginToggle('document-skills')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          pluginStatus['document-skills'] ? 'bg-dark-accent-primary' : 'bg-gray-600'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          pluginStatus['document-skills'] ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Amplitude Analysis Plugin */}
                  <div className="border border-dark-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-dark-text-primary">Amplitude Analysis</div>
                          <div className="text-xs text-dark-text-muted">Product analytics and insights tools</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePluginToggle('amplitude-analysis')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          pluginStatus['amplitude-analysis'] ? 'bg-dark-accent-primary' : 'bg-gray-600'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          pluginStatus['amplitude-analysis'] ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-dark-text-muted bg-dark-surface/50 border border-dark-border rounded p-3">
                    <p className="font-medium mb-1">📦 Plugin Installation</p>
                    <p>Plugins are installed via Claude Code CLI. Run the setup script:</p>
                    <code className="block mt-1 text-[10px] bg-dark-bg px-2 py-1 rounded">./setup-plugins.sh</code>
                    <p className="mt-2">See <code className="text-[10px] bg-dark-bg px-1 py-0.5 rounded">PLUGINS.md</code> for details.</p>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
        </div>
    </div>
  );
}
