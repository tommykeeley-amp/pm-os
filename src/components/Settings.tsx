import { useState, useEffect } from 'react';
import SlackChannelsConfig from './SlackChannelsConfig';

interface SettingsProps {
  onClose: () => void;
}

interface UserSettings {
  // Personal Info
  name?: string;
  email?: string;

  // Jira Settings
  jiraDomain?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraDefaultProject?: string;
  jiraDefaultIssueType?: string;

  // Confluence Settings
  confluenceDefaultSpace?: string;
  confluenceDefaultParentId?: string;

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
      name: 'Jira',
      description: 'Create tickets from tasks',
      type: 'api-token' as const,
      connected: false,
    },
  ]);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

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
      const jiraConfigured = await window.electronAPI.jiraIsConfigured();

      setIntegrations(prev => prev.map(integration => ({
        ...integration,
        connected: integration.id === 'google' ? !!googleTokens.accessToken :
                   integration.id === 'slack' ? !!slackTokens.accessToken :
                   integration.id === 'jira' ? jiraConfigured : false,
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Personal Tab */}
          {activeTab === 'personal' && (
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
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <div className="space-y-4">
              <p className="text-sm text-dark-text-secondary">
                Connect your accounts to get smart task suggestions from your calendar, emails, and messages.
              </p>

              <div className="space-y-3">
                {integrations.map(integration => (
                  <div
                    key={integration.id}
                    className="bg-dark-bg border border-dark-border rounded-lg p-4 flex items-center justify-between"
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
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                          </svg>
                        )}
                        {integration.id === 'jira' && (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84a.84.84 0 0 0-.84-.84H11.53zM2 11.53c0-2.4 1.97-4.35 4.35-4.35h1.78v-1.7c0-2.4 1.94-4.34 4.34-4.34V11.69a.84.84 0 0 1-.84.84H2zm9.53 9.47c0-2.4-1.97-4.35-4.35-4.35H5.4v-1.7c0-2.4-1.94-4.34-4.34-4.34v9.55c0 .46.37.84.84.84h9.63z" fill="#2684FF"/>
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

                    {integration.type === 'api-token' ? (
                      integration.connected ? (
                        <span className="text-xs text-dark-accent-success flex items-center gap-1">
                          <svg className="icon-xs" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Configured
                        </span>
                      ) : (
                        <span className="text-xs text-dark-text-muted">
                          Not configured
                        </span>
                      )
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
                            onClick={() => handleDisconnect(integration.id as 'google' | 'slack')}
                            className="text-xs text-dark-text-muted hover:text-dark-accent-danger transition-colors"
                          >
                            Disconnect
                          </button>
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
                ))}
              </div>

              <div className="pt-4 border-t border-dark-border">
                <p className="text-xs text-dark-text-muted">
                  Your credentials are stored securely on your device and never sent to external servers.
                </p>
              </div>

              {/* Slack Channels Configuration */}
              {integrations.find(i => i.id === 'slack')?.connected && (
                <SlackChannelsConfig />
              )}

              {/* Jira Configuration Section */}
              <div className="pt-6 border-t border-dark-border">
                <h3 className="text-base font-semibold text-dark-text-primary mb-4">Jira Configuration</h3>
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
                </div>
              </div>

              {/* Confluence Configuration Section */}
              <div className="pt-6 border-t border-dark-border">
                <h3 className="text-base font-semibold text-dark-text-primary mb-2">Confluence Configuration</h3>
                <p className="text-sm text-dark-text-secondary mb-4">
                  Confluence uses the same credentials as Jira. Configure your Jira settings above first.
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
                      placeholder="123456789"
                    />
                    <p className="text-xs text-dark-text-muted mt-1">
                      Optional parent page ID to organize new pages under a specific folder
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Customizations Tab */}
          {activeTab === 'customizations' && (
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

              <div className="space-y-4">
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
          )}
        </div>
    </div>
  );
}
