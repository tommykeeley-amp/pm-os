import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { detectDocType, getDocTypeIcon } from '../utils/docTypeDetection';

export interface Doc {
  id: string;
  title: string;
  url?: string;
  content?: string;
  tags?: TaskTag[];
  createdAt: string;
  updatedAt?: string;
  source?: string;
}

interface ObsidianNote {
  id: string;
  title: string;
  content: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  frontmatter?: any;
}

interface TaskTag {
  label: string;
  color: string;
}

interface DocsProps {
  isActive?: boolean;
}

export default function Docs({ isActive }: DocsProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [obsidianNotes, setObsidianNotes] = useState<ObsidianNote[]>([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<TaskTag[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [availableTags, setAvailableTags] = useState<TaskTag[]>([]);
  const [obsidianConfigured, setObsidianConfigured] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocTags, setEditingDocTags] = useState<TaskTag[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
    loadObsidianNotes();
    loadAvailableTags();
    checkObsidianConfig();
  }, []);

  // Auto-focus when tab becomes active and reload tags
  useEffect(() => {
    if (isActive) {
      // Reload tags to pick up any new tags created in Tasks tab
      loadAvailableTags();

      // Focus input
      if (inputRef.current) {
        // Small delay to ensure the tab panel is visible
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    }
  }, [isActive]);

  const loadDocs = async () => {
    try {
      const storedDocs = await window.electronAPI.getStoredData('docs');
      setDocs(storedDocs || []);
    } catch (error) {
      console.error('Failed to load docs:', error);
    }
  };

  const loadAvailableTags = async () => {
    try {
      // Get tags from tasks to maintain consistency
      const tasks = await window.electronAPI.getTasks();
      const tagMap = new Map<string, TaskTag>();

      tasks.forEach((task: any) => {
        task.tags?.forEach((tag: TaskTag) => {
          tagMap.set(tag.label.toLowerCase(), tag);
        });
      });

      setAvailableTags(Array.from(tagMap.values()));
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const checkObsidianConfig = async () => {
    try {
      const settings = await window.electronAPI.getUserSettings();
      setObsidianConfigured(!!settings.obsidianEnabled && !!settings.obsidianVaultPath);
    } catch (error) {
      console.error('Failed to check Obsidian config:', error);
    }
  };

  const loadObsidianNotes = async () => {
    try {
      const result = await window.electronAPI.obsidianListNotes();
      if (result.success && result.notes) {
        setObsidianNotes(result.notes);
      }
    } catch (error) {
      console.error('Failed to load Obsidian notes:', error);
    }
  };

  const handleOpenInObsidian = async (noteId: string) => {
    try {
      const result = await window.electronAPI.obsidianOpenInApp(noteId);
      if (!result.success) {
        alert(result.error || 'Failed to open in Obsidian');
      }
    } catch (error) {
      console.error('Failed to open in Obsidian:', error);
    }
  };

  const handleDeleteObsidianNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note from your Obsidian vault?')) {
      return;
    }

    try {
      const result = await window.electronAPI.obsidianDeleteNote(noteId);
      if (result.success) {
        await loadObsidianNotes();
      } else {
        alert(result.error || 'Failed to delete note');
      }
    } catch (error) {
      console.error('Failed to delete Obsidian note:', error);
    }
  };

  const saveDocs = async (updatedDocs: Doc[]) => {
    try {
      await window.electronAPI.saveData('docs', updatedDocs);
      setDocs(updatedDocs);
    } catch (error) {
      console.error('Failed to save docs:', error);
    }
  };

  const handleAddDoc = async () => {
    if (!newDocTitle.trim()) return;

    // If no URL provided, create an Obsidian note
    if (!newDocUrl.trim()) {
      if (!obsidianConfigured) {
        if (confirm('Obsidian vault path not configured. Would you like to configure it in Settings?')) {
          // User can configure in settings - just show the message for now
          alert('Please configure your Obsidian vault path in Settings (gear icon) under "Obsidian Integration"');
        }
        return;
      }

      try {
        const tagLabels = selectedTags.map(tag => tag.label);
        const result = await window.electronAPI.obsidianCreateNote({
          title: newDocTitle,
          content: '',
          tags: tagLabels
        });

        if (result.success && result.note) {
          setNewDocTitle('');
          setSelectedTags([]);
          setShowTagSelector(false);

          // Reload Obsidian notes to show the new note
          await loadObsidianNotes();
        } else {
          const errorMsg = result.error || 'Failed to create Obsidian note';
          if (errorMsg.includes('Vault path') || errorMsg.includes('not configured')) {
            alert('Please configure your Obsidian vault path in Settings (gear icon) under "Obsidian Integration"');
          } else {
            alert(errorMsg);
          }
        }
      } catch (error: any) {
        console.error('Failed to create Obsidian note:', error);
        const errorMsg = error.message || 'Failed to create Obsidian note';
        if (errorMsg.includes('Vault path') || errorMsg.includes('not configured')) {
          alert('Please configure your Obsidian vault path in Settings (gear icon) under "Obsidian Integration"');
        } else {
          alert(errorMsg);
        }
      }
      return;
    }

    // Otherwise create a regular doc with URL
    const newDoc: Doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: newDocTitle,
      url: newDocUrl || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      createdAt: new Date().toISOString(),
      source: 'manual',
    };

    const updatedDocs = [newDoc, ...docs];
    await saveDocs(updatedDocs);

    setNewDocTitle('');
    setNewDocUrl('');
    setSelectedTags([]);
  };

  const handleDeleteDoc = async (docId: string) => {
    const updatedDocs = docs.filter(doc => doc.id !== docId);
    await saveDocs(updatedDocs);
  };

  const handleOpenDoc = async (doc: Doc) => {
    // If it's an Obsidian note, open in Obsidian
    if (doc.source === 'obsidian' && doc.id) {
      await handleOpenInObsidian(doc.id);
    } else if (doc.url) {
      // Otherwise open URL in browser
      window.electronAPI.openExternal(doc.url);
    }
  };

  const toggleTag = (tag: TaskTag) => {
    setSelectedTags(prev => {
      const exists = prev.find(t => t.label === tag.label);
      if (exists) {
        return prev.filter(t => t.label !== tag.label);
      } else {
        return [...prev, tag];
      }
    });
  };

  const toggleEditingTag = (tag: TaskTag) => {
    setEditingDocTags(prev => {
      const exists = prev.find(t => t.label === tag.label);
      if (exists) {
        return prev.filter(t => t.label !== tag.label);
      } else {
        return [...prev, tag];
      }
    });
  };

  const handleStartEditingTags = (doc: Doc) => {
    setEditingDocId(doc.id);
    setEditingDocTags(doc.tags || []);
  };

  const handleSaveDocTags = async (docId: string) => {
    const updatedDocs = docs.map(doc => {
      if (doc.id === docId) {
        return { ...doc, tags: editingDocTags.length > 0 ? editingDocTags : undefined };
      }
      return doc;
    });
    await saveDocs(updatedDocs);
    setEditingDocId(null);
    setEditingDocTags([]);
  };

  const handleCancelEditingTags = () => {
    setEditingDocId(null);
    setEditingDocTags([]);
  };

  // Combine docs and obsidian notes
  const allDocs = [
    ...docs.map(d => ({ ...d, isObsidian: false })),
    ...obsidianNotes.map(n => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      source: 'obsidian',
      isObsidian: true,
      path: n.path,
    }))
  ];

  const filteredDocs = allDocs.filter((doc: any) => {
    const matchesSearch = !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-dark-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              placeholder="Add document... (cmd+shift+d)"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddDoc();
                }
              }}
              className="w-full px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
            />
          </div>
          <button
            onClick={handleAddDoc}
            disabled={!newDocTitle.trim()}
            className="px-4 py-2 bg-dark-accent-primary text-white rounded-lg hover:bg-dark-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>

        {/* URL field */}
        <input
          type="text"
          placeholder="URL (optional - creates Obsidian note if empty)"
          value={newDocUrl}
          onChange={(e) => setNewDocUrl(e.target.value)}
          className="w-full px-4 py-2 mb-3 bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary text-sm"
        />

        {/* Tag selector */}
        <div className="relative">
          <button
            onClick={() => setShowTagSelector(!showTagSelector)}
            className="text-sm text-dark-text-secondary hover:text-dark-text-primary transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            {selectedTags.length > 0 ? `${selectedTags.length} project(s) selected` : 'Add project tags'}
          </button>

          {showTagSelector && availableTags.length > 0 && (
            <div className="absolute top-full mt-2 left-0 bg-dark-surface border border-dark-border rounded-lg shadow-lg p-3 z-10 min-w-[200px]">
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => {
                  const isSelected = selectedTags.find(t => t.label === tag.label);
                  return (
                    <button
                      key={tag.label}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isSelected
                          ? 'ring-2 ring-white/50'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: `${tag.color}40`,
                        color: tag.color,
                      }}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected tags display */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {selectedTags.map(tag => (
              <span
                key={tag.label}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                }}
              >
                {tag.label}
                <button
                  onClick={() => toggleTag(tag)}
                  className="hover:bg-white/20 rounded-full p-0.5"
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

      {/* Search bar */}
      <div className="flex-shrink-0 p-4 border-b border-dark-border">
        <div className="relative">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-accent-primary"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-12 text-dark-text-muted">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium mb-1">No documents yet</p>
            <p className="text-xs">Add your first document to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocs.map((doc: any) => (
              <div
                key={doc.id}
                className="bg-dark-surface border border-dark-border rounded-lg p-4 hover:border-dark-accent-primary transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      {(() => {
                        const docType = detectDocType(doc.url, doc.source);
                        const { icon } = getDocTypeIcon(docType);
                        return <span className="w-5 h-5 flex-shrink-0 mt-0.5">{icon}</span>;
                      })()}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-dark-text-primary mb-1 group-hover:truncate">
                          {doc.title}
                        </h3>
                        {doc.isObsidian ? (
                          <span className="text-xs text-purple-500 block">Obsidian Note</span>
                        ) : doc.url && (
                          <button
                            onClick={() => handleOpenDoc(doc)}
                            className="text-xs text-dark-accent-primary hover:underline truncate block max-w-full text-left"
                          >
                            {doc.url}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    {editingDocId === doc.id ? (
                      <div className="mb-2 p-2 bg-dark-bg rounded-lg border border-dark-border">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {availableTags.map(tag => {
                            const isSelected = editingDocTags.find(t => t.label === tag.label);
                            return (
                              <button
                                key={tag.label}
                                onClick={() => toggleEditingTag(tag)}
                                className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                                  isSelected
                                    ? 'ring-2 ring-white/50'
                                    : 'opacity-70 hover:opacity-100'
                                }`}
                                style={{
                                  backgroundColor: `${tag.color}40`,
                                  color: tag.color,
                                }}
                              >
                                {tag.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveDocTags(doc.id)}
                            className="text-xs px-2 py-1 bg-dark-accent-primary text-white rounded hover:bg-dark-accent-primary/90 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEditingTags}
                            className="text-xs px-2 py-1 bg-dark-bg text-dark-text-secondary rounded hover:bg-dark-border transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {doc.tags.map((tag: any) => (
                              <span
                                key={tag.label}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                style={{ backgroundColor: tag.color }}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Right column: Actions and Date */}
                  <div className="flex flex-col items-end justify-between self-stretch">
                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Open button */}
                    {(doc as any).isObsidian ? (
                      <button
                        onClick={() => handleOpenInObsidian((doc as any).id)}
                        className="p-2 text-dark-text-muted hover:text-purple-500 hover:bg-dark-bg rounded transition-colors"
                        title="Open in Obsidian"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                    ) : doc.url && (
                      <button
                        onClick={() => handleOpenDoc(doc)}
                        className="p-2 text-dark-text-muted hover:text-dark-accent-primary hover:bg-dark-bg rounded transition-colors"
                        title="Open document"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                    )}
                    {/* Tags button - always visible */}
                    <button
                      onClick={() => handleStartEditingTags(doc)}
                      className="p-2 text-dark-text-muted hover:text-dark-accent-primary hover:bg-dark-bg rounded transition-colors"
                      title={doc.tags && doc.tags.length > 0 ? "Edit project tags" : "Add project tags"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => (doc as any).isObsidian ? handleDeleteObsidianNote((doc as any).id) : handleDeleteDoc(doc.id)}
                      className="p-2 text-dark-text-muted hover:text-dark-accent-danger hover:bg-dark-bg rounded transition-colors"
                      title={(doc as any).isObsidian ? "Delete from vault" : "Delete document"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                    {/* Date - bottom right */}
                    <p className="text-xs text-dark-text-muted">
                      {doc.isObsidian ? 'Updated' : 'Added'} {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
