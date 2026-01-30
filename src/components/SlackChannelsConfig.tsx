import { useState, useEffect } from 'react';

export default function SlackChannelsConfig() {
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadChannelsAndSettings();
  }, []);

  const loadChannelsAndSettings = async () => {
    setIsLoading(true);
    try {
      // Load available channels
      const channelsList = await window.electronAPI.getSlackChannels();
      setChannels(channelsList);

      // Load user settings to get selected channels
      const userSettings = await window.electronAPI.getUserSettings();
      setSelectedChannels(userSettings.slackChannels || []);
    } catch (error) {
      console.error('Failed to load Slack channels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleChannel = (channelId: string) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const userSettings = await window.electronAPI.getUserSettings();
      await window.electronAPI.saveUserSettings({
        ...userSettings,
        slackChannels: selectedChannels,
      });
    } catch (error) {
      console.error('Failed to save Slack channels:', error);
      alert('Failed to save Slack channels');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-6 border-t border-dark-border">
        <h3 className="text-base font-semibold text-dark-text-primary mb-4">
          Slack Channels for Chats Tab
        </h3>
        <div className="text-sm text-dark-text-secondary">Loading channels...</div>
      </div>
    );
  }

  // Filter channels based on search query
  const filteredChannels = channels.filter(channel =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pt-6 border-t border-dark-border">
      <h3 className="text-base font-semibold text-dark-text-primary mb-4">
        Slack Channels for Chats Tab
      </h3>
      <p className="text-sm text-dark-text-secondary mb-4">
        Select which Slack channels you want to monitor in the Chats tab. Direct messages are always included.
      </p>

      {/* Search input */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search channels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary focus:border-transparent"
        />
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto bg-dark-bg border border-dark-border rounded-lg p-3">
        {filteredChannels.length === 0 ? (
          <div className="text-sm text-dark-text-muted text-center py-4">
            {searchQuery ? 'No channels match your search' : 'No channels found'}
          </div>
        ) : (
          filteredChannels.map(channel => (
            <label
              key={channel.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-dark-surface cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedChannels.includes(channel.id)}
                onChange={() => handleToggleChannel(channel.id)}
                className="w-4 h-4 text-dark-accent-primary bg-dark-bg border-dark-border rounded focus:ring-2 focus:ring-dark-accent-primary"
              />
              <span className="text-sm text-dark-text-primary">
                #{channel.name}
              </span>
            </label>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-dark-text-muted">
          {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} selected
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary btn-sm"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
