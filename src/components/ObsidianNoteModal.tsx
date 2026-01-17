import { useState } from 'react';

interface ObsidianNoteModalProps {
  onClose: () => void;
  onSave: (noteData: { title: string; content: string; tags?: string[] }) => Promise<void>;
  initialTitle?: string;
  initialContent?: string;
  initialTags?: string[];
}

export default function ObsidianNoteModal({
  onClose,
  onSave,
  initialTitle = '',
  initialContent = '',
  initialTags = [],
}: ObsidianNoteModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave({
        title: title.trim(),
        content: content.trim(),
        tags: tags.length > 0 ? tags : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save note');
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target === e.currentTarget) {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-3xl max-h-[85vh] mx-4 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-dark-text-primary">New Obsidian Note</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text-primary transition-colors"
            disabled={isSaving}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-dark-accent-danger/10 border border-dark-accent-danger/20 rounded-lg p-3">
              <p className="text-sm text-dark-accent-danger">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
              placeholder="My Note Title"
              disabled={isSaving}
              autoFocus
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Tags (optional)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary text-sm"
                  placeholder="Add a tag (press Enter)"
                  disabled={isSaving}
                />
                <button
                  onClick={handleAddTag}
                  disabled={!tagInput.trim() || isSaving}
                  className="px-4 py-2 bg-dark-accent-primary text-white rounded-lg hover:bg-dark-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-dark-accent-primary/20 text-dark-accent-primary"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:bg-white/20 rounded-full p-0.5"
                        disabled={isSaving}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col">
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full flex-1 min-h-[300px] px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary resize-none font-mono text-sm leading-relaxed"
              placeholder="Write your note here... (Markdown supported)"
              disabled={isSaving}
            />
            <p className="text-xs text-dark-text-muted mt-1">
              Markdown is supported. Your note will be saved to your Obsidian vault.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-border flex gap-3 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="flex-1 px-6 py-2 bg-dark-accent-primary text-white rounded-lg hover:bg-dark-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save to Obsidian'}
          </button>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-dark-bg hover:bg-dark-border text-dark-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
