import { useState } from 'react';
import type { Task, TaskTag, LinkedItem } from '../types/task';
import { TAG_COLORS } from '../design-system/tokens';

interface TaskDetailModalProps {
  task: Task;
  existingTags: TaskTag[];
  onClose: () => void;
  onSave: (updates: Partial<Task>) => void;
}

// Simple markdown to HTML converter
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

  // Code
  html = html.replace(/`(.*?)`/g, '<code class="bg-dark-bg px-1 py-0.5 rounded text-sm font-mono">$1</code>');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Lists - convert to proper list items (will wrap in ul below)
  html = html.replace(/^\* (.*$)/gim, '<LISTITEM>$1</LISTITEM>');
  html = html.replace(/^- (.*$)/gim, '<LISTITEM>$1</LISTITEM>');

  // Wrap consecutive list items in ul tags
  html = html.replace(/(<LISTITEM>.*?<\/LISTITEM>\s*)+/g, (match) => {
    const items = match.match(/<LISTITEM>(.*?)<\/LISTITEM>/g)
      ?.map(item => item.replace(/<LISTITEM>(.*?)<\/LISTITEM>/, '<li>$1</li>'))
      .join('');
    return `<ul class="list-disc ml-6 my-2">${items}</ul>`;
  });

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="mb-2">');
  html = html.replace(/\n/g, '<br/>');

  return `<div class="prose prose-sm max-w-none"><p class="mb-2">${html}</p></div>`;
}

export default function TaskDetailModal({ task, existingTags, onClose, onSave }: TaskDetailModalProps) {
  // Get unique existing tags (deduplicate by label and color)
  const uniqueExistingTags = existingTags.reduce((acc: TaskTag[], tag) => {
    if (!acc.some(t => t.label === tag.label && t.color === tag.color)) {
      acc.push(tag);
    }
    return acc;
  }, []);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [tags, setTags] = useState<TaskTag[]>(task.tags || []);
  const [deadline, setDeadline] = useState(task.deadline || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6'); // Default to blue
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>(task.linkedItems || []);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [newLinkType, setNewLinkType] = useState<'confluence' | 'jira' | 'slack' | 'other'>('other');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const handleSave = () => {
    onSave({
      title,
      description,
      tags,
      deadline: deadline || undefined,
      linkedItems,
    });
    onClose();
  };

  const handleAddTag = () => {
    if (newTagLabel.trim()) {
      setTags([...tags, { label: newTagLabel.trim(), color: newTagColor }]);
      setNewTagLabel('');
      setShowTagInput(false);
      setShowTagDropdown(false);
    }
  };

  const handleSelectExistingTag = (tag: TaskTag) => {
    // Only add if not already present
    if (!tags.some(t => t.label === tag.label && t.color === tag.color)) {
      setTags([...tags, tag]);
    }
    setNewTagLabel('');
    setShowTagInput(false);
    setShowTagDropdown(false);
  };

  // Filter existing tags based on user input
  const filteredExistingTags = uniqueExistingTags.filter(tag =>
    tag.label.toLowerCase().includes(newTagLabel.toLowerCase()) &&
    !tags.some(t => t.label === tag.label && t.color === tag.color)
  );

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleAddLink = () => {
    if (newLinkTitle.trim() && newLinkUrl.trim()) {
      const newLink: LinkedItem = {
        id: `${Date.now()}-${Math.random()}`,
        type: newLinkType,
        title: newLinkTitle.trim(),
        url: newLinkUrl.trim(),
      };
      setLinkedItems([...linkedItems, newLink]);
      setNewLinkTitle('');
      setNewLinkUrl('');
      setNewLinkType('other');
      setShowLinkInput(false);
    }
  };

  const handleRemoveLink = (id: string) => {
    setLinkedItems(linkedItems.filter(item => item.id !== id));
  };

  const getLinkIcon = (type: string) => {
    switch (type) {
      case 'confluence':
        return (
          <svg className="icon-sm" fill="currentColor" viewBox="0 0 225 225">
            <path d="M 43 16 L 15 66 L 16 73 L 74 107 L 55 117 L 37 134 L 14 174 L 16 182 L 60 207 L 70 210 L 76 206 L 91 178 L 99 172 L 104 172 L 173 210 L 181 208 L 209 158 L 208 151 L 150 117 L 173 104 L 187 90 L 210 50 L 208 42 L 164 17 L 154 14 L 148 18 L 133 46 L 125 52 L 120 52 L 51 14 Z M 36 170 L 38 168 L 48 149 L 62 134 L 75 126 L 77 126 L 83 123 L 90 122 L 91 121 L 112 121 L 113 122 L 123 124 L 134 129 L 136 131 L 143 134 L 145 136 L 163 145 L 165 147 L 172 150 L 174 152 L 181 155 L 187 159 L 187 162 L 185 164 L 182 171 L 180 173 L 177 180 L 175 182 L 172 188 L 169 188 L 167 186 L 149 177 L 147 175 L 120 161 L 118 159 L 108 155 L 95 155 L 85 159 L 77 167 L 67 186 L 65 188 L 62 188 L 60 186 L 36 173 Z M 37 65 L 37 62 L 39 60 L 42 53 L 44 51 L 47 44 L 49 42 L 52 36 L 55 36 L 57 38 L 75 47 L 77 49 L 104 63 L 106 65 L 116 69 L 129 69 L 130 68 L 135 67 L 140 64 L 147 57 L 157 38 L 159 36 L 162 36 L 164 38 L 171 41 L 173 43 L 180 46 L 182 48 L 188 51 L 188 54 L 186 56 L 176 75 L 162 90 L 149 98 L 147 98 L 141 101 L 134 102 L 133 103 L 112 103 L 111 102 L 107 102 L 106 101 L 101 100 L 90 95 L 88 93 L 81 90 L 79 88 L 72 85 L 70 83 L 63 80 L 61 78 L 52 74 L 50 72 L 43 69 Z" fillRule="evenodd" />
          </svg>
        );
      case 'jira':
        return (
          <svg className="icon-sm" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 256 256">
            <path d="M 150 28 H 220 V 98 C 220 122 198 122 186 110 L 150 74 C 138 62 138 28 150 28 Z"/>
            <path d="M 86 84 H 156 V 154 C 156 178 134 178 122 166 L 86 130 C 74 118 74 84 86 84 Z"/>
            <path d="M 28 142 H 98 V 212 C 98 236 76 236 64 224 L 28 188 C 16 176 16 142 28 142 Z"/>
          </svg>
        );
      case 'slack':
        return (
          <svg className="icon-sm" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        );
      default:
        return (
          <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        );
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-dark-text-primary">Task Details</h2>
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
        <div className="modal-content">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
              placeholder="Task title"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.label}
                  <button
                    onClick={() => handleRemoveTag(index)}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <svg className="icon-xs" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </span>
              ))}

              {!showTagInput ? (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="px-3 py-1 border border-dashed border-dark-border rounded-full text-sm
                           text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-secondary transition-colors"
                >
                  + Add Tag
                </button>
              ) : (
                <div className="w-full p-2 bg-dark-bg rounded-lg border border-dark-border">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={newTagLabel}
                        onChange={(e) => setNewTagLabel(e.target.value)}
                        onFocus={() => setShowTagDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTagLabel.trim()) {
                            handleAddTag();
                          } else if (e.key === 'Escape') {
                            setShowTagDropdown(false);
                          }
                        }}
                        className="w-full px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm
                                 text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                        placeholder="Tag name"
                        autoFocus
                      />

                      {/* Typeahead Dropdown */}
                      {showTagDropdown && filteredExistingTags.length > 0 && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowTagDropdown(false)}
                          />
                          <div className="absolute z-20 mt-1 w-full bg-dark-surface border border-dark-border rounded-lg shadow-dropdown max-h-48 overflow-y-auto">
                            {filteredExistingTags.map((tag, index) => (
                              <button
                                key={index}
                                onClick={() => handleSelectExistingTag(tag)}
                                className="w-full text-left px-3 py-2 hover:bg-dark-bg transition-colors flex items-center gap-2"
                              >
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                  style={{ backgroundColor: tag.color }}
                                >
                                  {tag.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="w-8 h-8 rounded-full border-2 border-dark-border hover:scale-110 transition-all"
                        style={{ backgroundColor: newTagColor }}
                        title="Choose color"
                      />
                      {showColorPicker && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowColorPicker(false)}
                          />
                          <div className="absolute z-20 mt-1 flex flex-col gap-1 px-2 py-2 bg-dark-surface border border-dark-border rounded shadow-lg">
                            {TAG_COLORS.map((color) => (
                              <button
                                key={color.value}
                                onClick={() => {
                                  setNewTagColor(color.value);
                                  setShowColorPicker(false);
                                }}
                                className={`w-5 h-5 rounded-full transition-all ${
                                  newTagColor === color.value
                                    ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-surface scale-110'
                                    : 'hover:scale-110'
                                }`}
                                style={{ backgroundColor: color.value }}
                                title={color.name}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={handleAddTag}
                      className="btn-primary btn-sm"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowTagInput(false);
                        setNewTagLabel('');
                        setShowTagDropdown(false);
                      }}
                      className="p-1 text-dark-text-muted hover:text-dark-text-primary transition-colors"
                      title="Cancel"
                    >
                      <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="px-3 py-2 bg-dark-surface border border-dark-border rounded-lg
                       text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary
                       cursor-pointer [color-scheme:dark]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Description
            </label>

            {isEditingDescription ? (
              <>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => setIsEditingDescription(false)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary
                           min-h-[200px] resize-y font-mono text-sm"
                  placeholder="Add a description (supports markdown)..."
                  autoFocus
                />
                <p className="mt-2 text-xs text-dark-text-muted">
                  Supports markdown: **bold**, *italic*, `code`, [links](url), # headers, * lists
                </p>
              </>
            ) : (
              <div
                onClick={() => setIsEditingDescription(true)}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                         text-dark-text-primary min-h-[200px] text-sm cursor-text hover:border-dark-border/60 transition-colors"
                dangerouslySetInnerHTML={{ __html: description ? markdownToHtml(description) : '<p class="text-dark-text-muted italic">Click to add description...</p>' }}
              />
            )}
          </div>

          {/* Links */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Links
            </label>
            <div className="space-y-2">
              {linkedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg
                           hover:border-dark-border/60 transition-colors"
                >
                  <div className="text-dark-text-secondary flex-shrink-0">
                    {getLinkIcon(item.type)}
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-dark-accent-primary hover:underline truncate"
                    title={item.url}
                  >
                    {item.title}
                  </a>
                  <button
                    onClick={() => handleRemoveLink(item.id)}
                    className="text-dark-text-muted hover:text-dark-accent-danger transition-colors flex-shrink-0"
                    title="Remove link"
                  >
                    <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}

              {!showLinkInput ? (
                <button
                  onClick={() => setShowLinkInput(true)}
                  className="w-full px-3 py-2 border border-dashed border-dark-border rounded-lg text-sm
                           text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-secondary transition-colors"
                >
                  + Add Link
                </button>
              ) : (
                <div className="p-3 bg-dark-bg rounded-lg border border-dark-border space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={newLinkType}
                      onChange={(e) => setNewLinkType(e.target.value as 'confluence' | 'jira' | 'slack' | 'other')}
                      className="px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm
                               text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                    >
                      <option value="other">Other</option>
                      <option value="confluence">Confluence</option>
                      <option value="jira">Jira</option>
                      <option value="slack">Slack</option>
                    </select>
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      className="flex-1 px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm
                               text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                      placeholder="Link title"
                      autoFocus
                    />
                  </div>
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                    className="w-full px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm
                             text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                    placeholder="https://..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddLink}
                      className="flex-1 btn-primary btn-sm"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowLinkInput(false);
                        setNewLinkTitle('');
                        setNewLinkUrl('');
                        setNewLinkType('other');
                      }}
                      className="px-3 py-1.5 text-dark-text-muted hover:text-dark-text-primary transition-colors"
                      title="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="flex-1 btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!title.trim()} className="flex-1 btn-primary">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
