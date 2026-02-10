import { useState, useEffect } from 'react';

interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  avatar?: string;
}

export default function SlackDailyDigestConfig() {
  const [users, setUsers] = useState<SlackUser[]>([]);
  const [vipContacts, setVipContacts] = useState<string[]>([]);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsersAndSettings();
  }, []);

  const loadUsersAndSettings = async () => {
    setIsLoading(true);
    try {
      // Load user settings
      const userSettings = await window.electronAPI.getUserSettings();
      setVipContacts(userSettings.slackVipContacts || []);
      setDigestEnabled(userSettings.slackDailyDigestEnabled || false);

      // Load Slack users
      const slackUsers = await window.electronAPI.getSlackUsers();
      setUsers(slackUsers);
    } catch (error) {
      console.error('Failed to load digest settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleVip = (userId: string) => {
    setVipContacts(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const userSettings = await window.electronAPI.getUserSettings();
      await window.electronAPI.saveUserSettings({
        ...userSettings,
        slackVipContacts: vipContacts,
        slackDailyDigestEnabled: digestEnabled,
      });
    } catch (error) {
      console.error('Failed to save digest settings:', error);
      alert('Failed to save digest settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-6 border-t border-dark-border">
        <h3 className="text-base font-semibold text-dark-text-primary mb-4">
          Daily Digest
        </h3>
        <div className="text-sm text-dark-text-secondary">Loading settings...</div>
      </div>
    );
  }

  // Filter users based on search query
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.realName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pt-4 border-t border-dark-border space-y-4">
      <div>
        <h4 className="text-sm font-medium text-dark-text-primary mb-2">
          📬 Smart Inbox Digest
        </h4>
        <p className="text-sm text-dark-text-secondary mb-4">
          Get Slack DMs 3x per day (9AM, 12PM, 5PM) with "Things you might have missed" - actionable items from your monitored channels that haven't been completed yet.
        </p>

        {/* Enable/Disable Toggle */}
        <div className="bg-dark-surface border border-dark-border rounded-lg p-4 space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-sm font-medium text-dark-text-primary">
                Enable Smart Inbox
              </div>
              <div className="text-xs text-dark-text-muted mt-1">
                Receive DMs from PM-OS Bot at 9AM, 12PM, and 5PM
              </div>
            </div>
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(e) => setDigestEnabled(e.target.checked)}
              className="w-5 h-5 text-dark-accent-primary bg-dark-bg border-dark-border rounded focus:ring-2 focus:ring-dark-accent-primary"
            />
          </label>

          {/* Delivery Schedule Info */}
          {digestEnabled && (
            <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
              <div className="text-xs font-medium text-dark-text-secondary mb-2">
                Delivery Schedule
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-dark-text-primary">
                  <span className="text-dark-accent-primary">🌅</span>
                  <span className="font-medium">9:00 AM</span>
                  <span className="text-dark-text-muted">Morning catchup</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-dark-text-primary">
                  <span className="text-dark-accent-primary">☀️</span>
                  <span className="font-medium">12:00 PM</span>
                  <span className="text-dark-text-muted">Midday check-in</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-dark-text-primary">
                  <span className="text-dark-accent-primary">🌆</span>
                  <span className="font-medium">5:00 PM</span>
                  <span className="text-dark-text-muted">End of day wrap-up</span>
                </div>
              </div>
              <p className="text-xs text-dark-text-muted mt-2">
                Times are in your primary timezone (set in Personal tab)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* VIP Contacts */}
      {digestEnabled && (
        <div>
          <h4 className="text-sm font-medium text-dark-text-primary mb-2">
            ⭐ VIP Contacts
          </h4>
          <p className="text-sm text-dark-text-secondary mb-4">
            Messages from VIP contacts are weighted more heavily in your daily digest.
          </p>

          {/* Search input */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search teammates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary focus:border-transparent"
            />
          </div>

          {users.length === 0 ? (
            <div className="bg-dark-surface border border-dark-border rounded-lg p-4 text-center">
              <div className="text-sm text-dark-text-muted mb-2">
                No Slack users loaded yet
              </div>
              <p className="text-xs text-dark-text-muted">
                VIP contacts will be available after you connect to Slack and sync your workspace
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto bg-dark-bg border border-dark-border rounded-lg p-3">
              {filteredUsers.length === 0 ? (
                <div className="text-sm text-dark-text-muted text-center py-4">
                  {searchQuery ? 'No users match your search' : 'No users found'}
                </div>
              ) : (
                filteredUsers.map(user => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-dark-surface cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={vipContacts.includes(user.id)}
                      onChange={() => handleToggleVip(user.id)}
                      className="w-4 h-4 text-dark-accent-primary bg-dark-bg border-dark-border rounded focus:ring-2 focus:ring-dark-accent-primary"
                    />
                    {user.avatar && (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-6 h-6 rounded-full"
                      />
                    )}
                    <div>
                      <div className="text-sm text-dark-text-primary">
                        {user.realName || user.name}
                      </div>
                      {user.realName && (
                        <div className="text-xs text-dark-text-muted">
                          @{user.name}
                        </div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          )}

          {vipContacts.length > 0 && (
            <div className="mt-2 text-xs text-dark-text-muted">
              {vipContacts.length} VIP contact{vipContacts.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4 border-t border-dark-border">
        <div className="text-xs text-dark-text-muted">
          {digestEnabled ? (
            <>
              Digest enabled • {vipContacts.length} VIP{vipContacts.length !== 1 ? 's' : ''}
            </>
          ) : (
            'Digest disabled'
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary btn-sm"
        >
          {isSaving ? 'Saving...' : 'Save Digest Settings'}
        </button>
      </div>
    </div>
  );
}
