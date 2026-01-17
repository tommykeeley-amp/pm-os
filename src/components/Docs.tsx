import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import ObsidianNoteModal from './ObsidianNoteModal';

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
  onAddTask?: (title: string, tags?: TaskTag[]) => void;
  isActive?: boolean;
}

export default function Docs({ onAddTask, isActive }: DocsProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [obsidianNotes, setObsidianNotes] = useState<ObsidianNote[]>([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<TaskTag[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [availableTags, setAvailableTags] = useState<TaskTag[]>([]);
  const [showObsidianModal, setShowObsidianModal] = useState(false);
  const [obsidianConfigured, setObsidianConfigured] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
    loadObsidianNotes();
    loadAvailableTags();
    checkObsidianConfig();
  }, []);

  // Auto-focus when tab becomes active
  useEffect(() => {
    if (isActive && inputRef.current) {
      // Small delay to ensure the tab panel is visible
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
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
      setObsidianConfigured(!!settings.obsidianVaultPath);
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

  const handleCreateObsidianNote = async (noteData: { title: string; content: string; tags?: string[] }) => {
    try {
      const result = await window.electronAPI.obsidianCreateNote(noteData);
      if (result.success) {
        await loadObsidianNotes();
      } else {
        alert(result.error || 'Failed to create note');
      }
    } catch (error: any) {
      console.error('Failed to create Obsidian note:', error);
      alert(error.message || 'Failed to create note');
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

  const handleOpenDoc = (doc: Doc) => {
    if (doc.url) {
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
          {obsidianConfigured && (
            <button
              onClick={() => setShowObsidianModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              title="Create note in Obsidian vault"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Note
            </button>
          )}
        </div>

        {/* URL field */}
        <input
          type="text"
          placeholder="URL (optional)"
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
                      <svg
                        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${doc.isObsidian ? 'text-purple-500' : 'text-dark-accent-primary'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-dark-text-primary mb-1 truncate">
                          {doc.title}
                          {doc.isObsidian && (
                            <span className="ml-2 text-xs text-purple-500 font-normal">Obsidian</span>
                          )}
                        </h3>
                        {doc.url && (
                          <button
                            onClick={() => handleOpenDoc(doc)}
                            className="text-xs text-dark-accent-primary hover:underline truncate block max-w-full"
                          >
                            {doc.url}
                          </button>
                        )}
                        <p className="text-xs text-dark-text-muted mt-1">
                          {doc.isObsidian ? 'Updated' : 'Added'} {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>

                    {/* Tags */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {doc.tags.map((tag: any) => (
                          <span
                            key={tag.label}
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                            }}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(doc as any).isObsidian && (
                      <button
                        onClick={() => handleOpenInObsidian((doc as any).id)}
                        className="p-2 text-dark-text-muted hover:text-purple-500 hover:bg-dark-bg rounded transition-colors"
                        title="Open in Obsidian"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 100 100">
                          <path d="M64.4 15.8L33.2 2.3c-2.5-1.1-5.4.7-5.4 3.4v88.7c0 2.7 2.9 4.5 5.4 3.4l31.2-13.5c1.8-.8 2.9-2.5 2.9-4.4V20.2c0-1.9-1.2-3.6-2.9-4.4z"/>
                        </svg>
                      </button>
                    )}
                    {doc.url && !(doc as any).isObsidian && (
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
                    <button
                      onClick={() => {
                        if (onAddTask) {
                          onAddTask(`Review: ${doc.title}`, doc.tags);
                        }
                      }}
                      className="p-2 text-dark-text-muted hover:text-dark-accent-primary hover:bg-dark-bg rounded transition-colors"
                      title="Create task from document"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </button>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Obsidian Note Modal */}
      {showObsidianModal && (
        <ObsidianNoteModal
          onClose={() => setShowObsidianModal(false)}
          onSave={handleCreateObsidianNote}
        />
      )}
    </div>
  );
}
