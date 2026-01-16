import { useState, useEffect } from 'react';

interface Integration {
  id: 'google' | 'slack' | 'jira';
  name: string;
  description: string;
  icon: JSX.Element;
  connected: boolean;
  type: 'oauth' | 'api-token';
}

interface IntegrationsProps {
  onClose: () => void;
}

export default function Integrations({ onClose }: IntegrationsProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'google',
      name: 'Google',
      description: 'Calendar & Gmail',
      type: 'oauth',
      icon: (
        <svg className="icon-md" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
      connected: false,
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Messages & mentions',
      type: 'oauth',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
      ),
      connected: false,
    },
    {
      id: 'jira',
      name: 'Jira',
      description: 'Create tickets from tasks',
      type: 'api-token',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84a.84.84 0 0 0-.84-.84H11.53zM2 11.53c0-2.4 1.97-4.35 4.35-4.35h1.78v-1.7c0-2.4 1.94-4.34 4.34-4.34V11.69a.84.84 0 0 1-.84.84H2zm9.53 9.47c0-2.4-1.97-4.35-4.35-4.35H5.4v-1.7c0-2.4-1.94-4.34-4.34-4.34v9.55c0 .46.37.84.84.84h9.63z" fill="#2684FF"/>
        </svg>
      ),
      connected: false,
    },
  ]);

  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  useEffect(() => {
    checkConnections();
  }, []);

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

  const handleConnect = async (integrationId: 'google' | 'slack') => {
    setIsConnecting(integrationId);

    try {
      const result = await window.electronAPI.startOAuthFlow(integrationId);

      if (result.code) {
        // In a real implementation, you would exchange the code for tokens here
        // For now, we'll mark it as connected
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
      // Clear stored tokens
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
    <div className="modal-backdrop">
      <div className="modal-container w-full max-w-md mx-4 animate-slide-in">
        {/* Header */}
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-dark-text-primary">Integrations</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text-primary transition-colors"
          >
            <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
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
                    {integration.icon}
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
                  // API token integrations (like Jira)
                  integration.connected ? (
                    <span className="text-xs text-dark-accent-success flex items-center gap-1">
                      <svg className="icon-xs" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Configured
                    </span>
                  ) : (
                    <a
                      href="https://github.com/tommykeeley-amp/pm-os#jiraatlassian"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-dark-accent-primary hover:text-dark-accent-primary/80 transition-colors"
                    >
                      Setup Guide →
                    </a>
                  )
                ) : (
                  // OAuth integrations (Google, Slack)
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
        </div>
      </div>
    </div>
  );
}
