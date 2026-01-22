import { useState, useEffect } from 'react';
import SlackChannelsConfig from './SlackChannelsConfig';
import TabPanel from './TabPanel';

interface SettingsProps {
  onClose: () => void;
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

  // Confluence Settings
  confluenceDefaultSpace?: string;
  confluenceDefaultParentId?: string;
  confluenceSystemPrompt?: string;

  // Obsidian Settings
  obsidianEnabled?: boolean;
  obsidianVaultPath?: string;

  // Slack Settings
  slackBotToken?: string;

  // Customization Settings
  showDeclinedMeetings?: boolean;
  primaryTimezone?: string;
  secondaryTimezone?: string;
}

export default function Settings({ onClose }: SettingsProps) {
  const [settings, setSettings] = useState<UserSettings>({});
  const [activeTab, setActiveTab] = useState<'personal' | 'integrations' | 'customizations'>('personal');

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
  const [jiraExpanded, setJiraExpanded] = useState(false);
  const [slackExpanded, setSlackExpanded] = useState(false);
  const [obsidianExpanded, setObsidianExpanded] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testingJira, setTestingJira] = useState(false);

  useEffect(() => {
    loadSettings();
    checkConnections();

    // Listen for OAuth success events
    const handleOAuthSuccess = () => {
      console.log('[Settings] OAuth success event received, refreshing connections...');
      checkConnections();
      setIsConnecting(null);
    };

    window.electronAPI.onOAuthSuccess?.(handleOAuthSuccess);

    return () => {
      // Cleanup listener if needed
    };
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await window.electronAPI.getUserSettings();
      setSettings(stored || {});
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const checkConnections = async () => {
    try {
      const googleTokens = await window.electronAPI.getOAuthTokens('google');
      const slackTokens = await window.electronAPI.getOAuthTokens('slack');
      const userSettings = await window.electronAPI.getUserSettings();
      const jiraEnabled = !!userSettings?.jiraEnabled;
      const obsidianEnabled = !!userSettings?.obsidianEnabled;

      setIntegrations(prev => prev.map(integration => ({
        ...integration,
        connected: integration.id === 'google' ? !!googleTokens.accessToken :
                   integration.id === 'slack' ? !!slackTokens.accessToken :
                   integration.id === 'jira' ? jiraEnabled :
                   integration.id === 'obsidian' ? obsidianEnabled : false,
      })));
    } catch (error) {
      console.error('Failed to check connections:', error);
    }
  };

  const handleChange = async (field: keyof UserSettings, value: string | boolean) => {
    const updatedSettings = { ...settings, [field]: value };
    setSettings(updatedSettings);

    // Auto-save settings
    try {
      await window.electronAPI.saveUserSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleConnect = async (integrationId: 'google' | 'slack') => {
    setIsConnecting(integrationId);

    try {
      const result = await window.electronAPI.startOAuthFlow(integrationId);

      if (result.code) {
        setIntegrations(prev => prev.map(integration =>
          integration.id === integrationId ? { ...integration, connected: true } : integration
        ));
      }
    } catch (error) {
      console.error(`Failed to connect ${integrationId}:`, error);
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (integrationId: 'google' | 'slack') => {
    try {
      await window.electronAPI.saveOAuthTokens(integrationId, {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      });

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

  return (
    <div className="w-full h-full bg-dark-bg flex flex-col">
      {/* Header */}
      <div className="bg-dark-surface border-b border-dark-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onClose}
          className="text-dark-text-secondary hover:text-dark-text-primary transition-colors flex items-center gap-2"
        >
          <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>
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
                  Email Address
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
                  Your email address for integrations and notifications
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

              <div className="space-y-3">
                {integrations.map(integration => (
                  <div key={integration.id}>
                    <div
                      onClick={() => {
                        if (integration.id === 'jira' && integration.connected) setJiraExpanded(!jiraExpanded);
                        if (integration.id === 'slack' && integration.connected) setSlackExpanded(!slackExpanded);
                        if (integration.id === 'obsidian' && integration.connected) setObsidianExpanded(!obsidianExpanded);
                      }}
                      className={`bg-dark-bg border border-dark-border rounded-lg p-4 flex items-center justify-between ${
                        ((integration.id === 'jira' || integration.id === 'obsidian' || integration.id === 'slack') && integration.connected) ? 'cursor-pointer hover:border-dark-accent-primary/50 transition-colors' : ''
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

                      <div className="flex items-center gap-2">
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
                              <div className={`mt-2 text-xs ${jiraTestResult.success ? 'text-dark-accent-success' : 'text-dark-accent-danger'}`}>
                                {jiraTestResult.success ? (
                                  <span className="flex items-center gap-1">
                                    <svg className="icon-xs" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Connection successful!
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <svg className="icon-xs" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    {jiraTestResult.error || 'Connection failed'}
                                  </span>
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
                                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                                  AI System Prompt (Optional)
                                </label>
                                <textarea
                                  value={settings.confluenceSystemPrompt || ''}
                                  onChange={(e) => handleChange('confluenceSystemPrompt', e.target.value)}
                                  rows={4}
                                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary text-sm"
                                  placeholder="You are creating a simple Confluence page. Take the provided context and create clean, readable content..."
                                />
                                <p className="text-xs text-dark-text-muted mt-1">
                                  Customize how OpenAI formats your Confluence pages. Leave blank to use the default prompt.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Slack Settings - shows when this is Slack and it's connected and expanded */}
                    {integration.id === 'slack' && integration.connected && slackExpanded && (
                      <div className="space-y-3 mt-3">
                        <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
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
            <div className="space-y-4">
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
                    value={settings.primaryTimezone || 'America/New_York'}
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
                    value={settings.secondaryTimezone || 'America/Los_Angeles'}
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
            </div>
          </TabPanel>
        </div>
    </div>
  );
}
