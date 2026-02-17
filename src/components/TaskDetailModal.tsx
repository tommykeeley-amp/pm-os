import { useState, useEffect, useRef } from 'react';
import type { Task, TaskTag, LinkedItem } from '../types/task';
import { TAG_COLORS } from '../design-system/tokens';
import LinkedDocsSelector from './LinkedDocsSelector';

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
  // Handle *, -, and • bullet characters at start of lines
  html = html.replace(/^\* (.*$)/gim, '<LISTITEM>$1</LISTITEM>');
  html = html.replace(/^- (.*$)/gim, '<LISTITEM>$1</LISTITEM>');
  html = html.replace(/^• (.*$)/gim, '<LISTITEM>$1</LISTITEM>');

  // Also handle bullets that appear inline (e.g., "text • bullet1 • bullet2")
  // Check if there are inline bullets (not at start of line)
  if (/[^\n]•/.test(html) && !html.includes('<LISTITEM>')) {
    // Split on bullets and create list items
    const parts = html.split(/\s*•\s*/);
    html = parts.map(part => part.trim() ? `<LISTITEM>${part.trim()}</LISTITEM>` : '').filter(Boolean).join('');
  }

  // Wrap consecutive list items in ul tags
  html = html.replace(/(<LISTITEM>.*?<\/LISTITEM>\s*)+/g, (match) => {
    const items = match.match(/<LISTITEM>(.*?)<\/LISTITEM>/g)
      ?.map(item => item.replace(/<LISTITEM>(.*?)<\/LISTITEM>/, '<li class="mb-1">$1</li>'))
      .join('');
    return `<ul class="list-disc ml-6 my-2 space-y-1">${items}</ul>`;
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
  const [deadline, setDeadline] = useState(task.deadline || new Date().toISOString().split('T')[0]);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6'); // Default to blue
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>(task.linkedItems || []);

  // Debounce timer refs
  const titleDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const descriptionDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Skip autosave on initial mount
  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  // Autosave title with debounce (500ms)
  useEffect(() => {
    if (!isInitialMount.current && title !== task.title && title.trim()) {
      if (titleDebounceTimer.current) {
        clearTimeout(titleDebounceTimer.current);
      }
      titleDebounceTimer.current = setTimeout(() => {
        onSave({ title });
      }, 500);
    }
    return () => {
      if (titleDebounceTimer.current) {
        clearTimeout(titleDebounceTimer.current);
      }
    };
  }, [title]);

  // Autosave description with debounce (500ms)
  useEffect(() => {
    if (!isInitialMount.current && description !== (task.description || '')) {
      if (descriptionDebounceTimer.current) {
        clearTimeout(descriptionDebounceTimer.current);
      }
      descriptionDebounceTimer.current = setTimeout(() => {
        onSave({ description });
      }, 500);
    }
    return () => {
      if (descriptionDebounceTimer.current) {
        clearTimeout(descriptionDebounceTimer.current);
      }
    };
  }, [description]);

  // Autosave tags immediately
  useEffect(() => {
    if (!isInitialMount.current) {
      const currentTags = JSON.stringify(task.tags || []);
      const newTags = JSON.stringify(tags);
      if (currentTags !== newTags) {
        onSave({ tags });
      }
    }
  }, [tags]);

  // Autosave deadline immediately
  useEffect(() => {
    if (!isInitialMount.current && deadline !== (task.deadline || '')) {
      onSave({ deadline: deadline || undefined });
    }
  }, [deadline]);

  // Autosave linked items immediately
  useEffect(() => {
    if (!isInitialMount.current) {
      const currentItems = JSON.stringify(task.linkedItems || []);
      const newItems = JSON.stringify(linkedItems);
      if (currentItems !== newItems) {
        onSave({ linkedItems });
      }
    }
  }, [linkedItems]);

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

  const handleAddLink = (item: LinkedItem) => {
    setLinkedItems([...linkedItems, item]);
  };

  const handleRemoveLink = (itemId: string) => {
    setLinkedItems(linkedItems.filter(item => item.id !== itemId));
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
        <h2 className="text-lg font-semibold text-dark-text-primary">Task Details</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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

          {/* Projects */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Projects
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
                  + Add Project
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

          {/* Docs */}
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              Docs
            </label>
            <LinkedDocsSelector
              linkedItems={linkedItems}
              taskTags={tags}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
            />
          </div>

      </div>
    </div>
  );
}
