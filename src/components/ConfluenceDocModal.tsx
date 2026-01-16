import { useState, useEffect } from 'react';
import type { Task } from '../types/task';

interface ConfluenceDocModalProps {
  task: Task;
  onClose: () => void;
  onSuccess: (pageId: string, pageUrl: string) => void;
}

export default function ConfluenceDocModal({ task, onClose, onSuccess }: ConfluenceDocModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.context || '');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<'create' | 'link'>('create');

  useEffect(() => {
    loadSpaces();
  }, []);

  const loadSpaces = async () => {
    try {
      const spaceList = await window.electronAPI.confluenceGetSpaces();
      setSpaces(spaceList);
      if (spaceList.length > 0) {
        // Prepopulate with PA1 space if it exists, otherwise use first space
        const pa1Space = spaceList.find((s: any) => s.key === 'PA1');
        setSelectedSpace(pa1Space ? pa1Space.key : spaceList[0].key);
      }
    } catch (err: any) {
      setError('Failed to load spaces: ' + err.message);
    }
  };

  const handleCreate = async () => {
    if (!title || !selectedSpace) {
      setError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const result = await window.electronAPI.confluenceCreatePage({
        title,
        body,
        spaceKey: selectedSpace,
      });

      onSuccess(result.id, result.url);
    } catch (err: any) {
      setError('Failed to create page: ' + err.message);
      setIsCreating(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      const results = await window.electronAPI.confluenceSearchPages(searchQuery, selectedSpace);
      setSearchResults(results);
      if (results.length === 0) {
        setError('No pages found matching your query');
      }
    } catch (err: any) {
      setError('Failed to search pages: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLinkPage = (page: any) => {
    onSuccess(page.id, page.url);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container w-full max-w-lg mx-4 animate-slide-in max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="modal-header flex-shrink-0">
          <h2 className="text-lg font-semibold text-dark-text-primary">Confluence Document</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text-primary transition-colors"
          >
            <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-6 pt-4 flex gap-2 flex-shrink-0">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-dark-accent-primary text-white'
                : 'bg-dark-bg text-dark-text-secondary hover:text-dark-text-primary'
            }`}
          >
            Create New
          </button>
          <button
            onClick={() => setMode('link')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'link'
                ? 'bg-dark-accent-primary text-white'
                : 'bg-dark-bg text-dark-text-secondary hover:text-dark-text-primary'
            }`}
          >
            Link Existing
          </button>
        </div>

        {/* Content */}
        <div className="modal-content space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-dark-accent-danger/10 border border-dark-accent-danger/30 rounded-lg">
              <p className="text-sm text-dark-accent-danger">{error}</p>
            </div>
          )}

          {mode === 'create' ? (
            <>
              {/* Space Selection */}
              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Space *
                </label>
                <select
                  value={selectedSpace}
                  onChange={(e) => setSelectedSpace(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                  disabled={isCreating}
                >
                  {spaces.map((space) => (
                    <option key={space.key} value={space.key}>
                      {space.name} ({space.key})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Page Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                  placeholder="Enter page title"
                  disabled={isCreating}
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Content
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary
                           min-h-[120px] resize-y"
                  placeholder="Enter page content (supports basic markdown)"
                  disabled={isCreating}
                />
              </div>
            </>
          ) : (
            <>
              {/* Space Filter */}
              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Space (optional filter)
                </label>
                <select
                  value={selectedSpace}
                  onChange={(e) => setSelectedSpace(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                >
                  <option value="">All Spaces</option>
                  {spaces.map((space) => (
                    <option key={space.key} value={space.key}>
                      {space.name} ({space.key})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Search Pages
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                             text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
                    placeholder="Search by title"
                    disabled={isSearching}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="btn-primary"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-dark-text-secondary">
                    Results ({searchResults.length})
                  </label>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {searchResults.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => handleLinkPage(page)}
                        className="w-full text-left p-3 bg-dark-bg border border-dark-border rounded-lg
                                 hover:border-dark-accent-primary transition-colors"
                      >
                        <p className="text-sm font-medium text-dark-text-primary">{page.title}</p>
                        <p className="text-xs text-dark-text-muted mt-1">Space: {page.spaceKey}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {mode === 'create' && (
          <div className="modal-footer flex-shrink-0">
            <button
              onClick={onClose}
              disabled={isCreating}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || !title || !selectedSpace}
              className="flex-1 btn-primary"
            >
              {isCreating ? 'Creating...' : 'Create Page'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
