import { useState, useEffect, useRef } from 'react';
import { LinkedItem, LinkedItemType, TaskTag } from '../types/task';
import { Doc } from './Docs';
import { detectDocType, getDocTypeIcon, getDocTypeLabel } from '../utils/docTypeDetection';
import { fuzzyFilter } from '../utils/fuzzySearch';

interface LinkedDocsSelectorProps {
  linkedItems?: LinkedItem[];
  taskTags?: TaskTag[];
  onAddLink: (item: LinkedItem) => void;
  onRemoveLink: (itemId: string) => void;
  allowRemove?: boolean;
}

export default function LinkedDocsSelector({ linkedItems = [], taskTags = [], onAddLink, onRemoveLink, allowRemove = true }: LinkedDocsSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<Array<Doc & { displayType: LinkedItemType }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkMode, setLinkMode] = useState<'docs' | 'custom'>('docs');
  const [customTitle, setCustomTitle] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showDropdown) {
      loadAvailableDocs();
    }
  }, [showDropdown]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const loadAvailableDocs = async () => {
    try {
      // Only load regular docs from Docs tab
      const docs = await window.electronAPI.getStoredData('docs') || [];

      // Map docs with detected types
      const allDocs = docs.map((doc: Doc) => ({
        ...doc,
        displayType: detectDocType(doc.url, doc.source)
      }));

      setAvailableDocs(allDocs);
    } catch (error) {
      console.error('Failed to load available docs:', error);
    }
  };

  // Calculate tag match score for prioritization
  const getTagMatchScore = (doc: Doc & { displayType: LinkedItemType }): number => {
    if (!doc.tags || !taskTags.length) return 0;

    const matchingTags = doc.tags.filter(docTag =>
      taskTags.some(taskTag => taskTag.label === docTag.label)
    );

    return matchingTags.length;
  };

  // Apply fuzzy search and sort by tag matches
  const filteredDocs = (() => {
    // Use fuzzy search if there's a query
    const searched = searchQuery.trim()
      ? fuzzyFilter(availableDocs, searchQuery, doc => doc.title)
      : availableDocs;

    // Sort by tag matches first, then by creation date
    return searched.sort((a, b) => {
      const tagScoreA = getTagMatchScore(a);
      const tagScoreB = getTagMatchScore(b);

      if (tagScoreA !== tagScoreB) {
        return tagScoreB - tagScoreA; // Higher tag match first
      }

      // Then by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  })();

  const handleSelectDoc = (doc: Doc & { displayType: LinkedItemType }) => {
    const linkedItem: LinkedItem = {
      id: doc.id,
      type: doc.displayType,
      title: doc.title,
      url: doc.url
    };
    onAddLink(linkedItem);
    setShowDropdown(false);
    setSearchQuery('');
  };

  const handleAddCustomLink = () => {
    if (!customTitle.trim() || !customUrl.trim()) return;

    const linkedItem: LinkedItem = {
      id: `custom-${Date.now()}`,
      type: 'link' as LinkedItemType,
      title: customTitle.trim(),
      url: customUrl.trim()
    };
    onAddLink(linkedItem);
    setCustomTitle('');
    setCustomUrl('');
    setShowDropdown(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Linked docs display */}
      <div className="flex flex-wrap gap-1 items-center">
        {linkedItems.map(item => {
          const { icon } = getDocTypeIcon(item.type);
          return (
            <div
              key={item.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-text-secondary hover:text-dark-text-primary transition-colors group cursor-pointer"
              title={`${getDocTypeLabel(item.type)}: ${item.title}`}
              onClick={(e) => {
                if (item.url) {
                  e.stopPropagation();
                  window.open(item.url, '_blank');
                }
              }}
            >
              <span>{icon}</span>
              <span className="max-w-[120px] truncate">{item.title}</span>
              {allowRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLink(item.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}

        {/* Add link button */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-bg rounded transition-colors"
          title="Link docs"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50 max-h-80 overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-dark-border">
            <button
              onClick={() => setLinkMode('docs')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                linkMode === 'docs'
                  ? 'text-dark-accent-primary border-b-2 border-dark-accent-primary'
                  : 'text-dark-text-muted hover:text-dark-text-primary'
              }`}
            >
              From Docs
            </button>
            <button
              onClick={() => setLinkMode('custom')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                linkMode === 'custom'
                  ? 'text-dark-accent-primary border-b-2 border-dark-accent-primary'
                  : 'text-dark-text-muted hover:text-dark-text-primary'
              }`}
            >
              Custom Link
            </button>
          </div>

          {linkMode === 'docs' ? (
            <>
              {/* Search */}
              <div className="p-2 border-b border-dark-border">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search docs..."
                  className="w-full px-3 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                  autoFocus
                />
              </div>

              {/* Docs list */}
              <div className="overflow-y-auto flex-1">
                {filteredDocs.length === 0 ? (
                  <div className="p-4 text-center text-sm text-dark-text-muted">
                    No docs found
                  </div>
                ) : (
                  filteredDocs.map(doc => {
                    const { icon } = getDocTypeIcon(doc.displayType);
                    const isAlreadyLinked = linkedItems.some(item => item.id === doc.id);
                    const tagMatchScore = getTagMatchScore(doc);
                    const matchingTags = doc.tags?.filter(docTag =>
                      taskTags.some(taskTag => taskTag.label === docTag.label)
                    ) || [];

                    return (
                      <button
                        key={doc.id}
                        onClick={() => !isAlreadyLinked && handleSelectDoc(doc)}
                        disabled={isAlreadyLinked}
                        className={`w-full px-3 py-2 text-left hover:bg-dark-bg transition-colors flex items-start gap-2 ${
                          isAlreadyLinked ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <span className="text-base mt-0.5">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-dark-text-primary truncate">
                              {doc.title}
                            </div>
                            {tagMatchScore > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-dark-accent-primary/20 text-dark-accent-primary rounded-full flex-shrink-0">
                                {tagMatchScore} tag{tagMatchScore > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs text-dark-text-muted">
                              {getDocTypeLabel(doc.displayType)}
                            </span>
                            {matchingTags.length > 0 && (
                              <>
                                <span className="text-xs text-dark-text-muted">•</span>
                                <div className="flex gap-1 flex-wrap">
                                  {matchingTags.slice(0, 2).map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[10px] px-1 py-0.5 rounded"
                                      style={{ backgroundColor: tag.color + '40', color: tag.color }}
                                    >
                                      {tag.label}
                                    </span>
                                  ))}
                                  {matchingTags.length > 2 && (
                                    <span className="text-[10px] text-dark-text-muted">
                                      +{matchingTags.length - 2}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {isAlreadyLinked && (
                          <span className="text-xs text-dark-text-muted mt-1 flex-shrink-0">Linked</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Custom Link Form */
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                  Link Title
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g., Design Mockups, Requirements Doc"
                  className="w-full px-3 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customTitle.trim() && customUrl.trim()) {
                      handleAddCustomLink();
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-1 focus:ring-dark-accent-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customTitle.trim() && customUrl.trim()) {
                      handleAddCustomLink();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleAddCustomLink}
                disabled={!customTitle.trim() || !customUrl.trim()}
                className="w-full px-3 py-2 bg-dark-accent-primary text-white text-sm rounded hover:bg-dark-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Link
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
