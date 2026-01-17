import { useState, useEffect } from 'react';
import { aiService } from '../services/ai-service';

interface Suggestion {
  id: string;
  title: string;
  source: string;
  context?: string;
  priority?: string;
  dueDate?: string;
}

interface TaskTag {
  label: string;
  color: string;
}

interface ScoredSuggestion extends Suggestion {
  relevanceScore?: number;
  matchedTags?: string[];
}

interface SmartSuggestionsProps {
  suggestions: Suggestion[];
  onAddTask: (suggestion: Suggestion) => void;
  onDismiss: (id: string) => void;
  projectTags?: TaskTag[];
}

function getSourceColor(source: string) {
  switch (source) {
    case 'calendar':
      return 'bg-blue-500/10 text-blue-400';
    case 'email':
      return 'bg-purple-500/10 text-purple-400';
    case 'slack':
      return 'bg-pink-500/10 text-pink-400';
    default:
      return 'bg-gray-500/10 text-gray-400';
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'calendar':
      return 'Calendar';
    case 'email':
      return 'Email';
    case 'slack':
      return 'Slack';
    default:
      return source;
  }
}

export default function SmartSuggestions({
  suggestions,
  onAddTask,
  onDismiss,
  projectTags = [],
}: SmartSuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filteredSuggestions, setFilteredSuggestions] = useState<ScoredSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize AI service
  useEffect(() => {
    const initAI = async () => {
      const apiKey = await window.electronAPI.getSettings().then((settings: any) =>
        settings.openaiApiKey || process.env.OPENAI_API_KEY
      );
      if (apiKey) {
        await aiService.initialize(apiKey);
      }
    };
    initAI();
  }, []);

  const filterSuggestions = async () => {
    if (suggestions.length === 0) {
      setFilteredSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      // Try AI-powered matching first
      if (aiService.isAvailable() && projectTags.length > 0) {
        console.log('[SmartSuggestions] Using AI to match suggestions to tags');
        const scored = await aiService.matchSuggestionsToTags(suggestions, projectTags);

        // Sort by relevance score
        scored.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

        // Return top 5
        setFilteredSuggestions(scored.slice(0, 5));
      } else {
        // Fallback to keyword matching
        console.log('[SmartSuggestions] Using keyword matching');
        const scored = keywordMatchSuggestions(suggestions, projectTags);
        setFilteredSuggestions(scored.slice(0, 5));
      }
    } catch (error) {
      console.error('[SmartSuggestions] Error filtering suggestions:', error);
      // Fallback to keyword matching on error
      const scored = keywordMatchSuggestions(suggestions, projectTags);
      setFilteredSuggestions(scored.slice(0, 5));
    } finally {
      setIsLoading(false);
    }
  };

  // Fallback keyword matching
  const keywordMatchSuggestions = (
    suggestions: Suggestion[],
    projectTags: TaskTag[]
  ): ScoredSuggestion[] => {
    if (projectTags.length === 0) {
      return suggestions.slice(0, 5).map(s => ({ ...s, relevanceScore: 0, matchedTags: [] }));
    }

    const scoredSuggestions = suggestions.map(suggestion => {
      const text = `${suggestion.title} ${suggestion.context || ''}`.toLowerCase();
      let relevanceScore = 0;
      const matchedTags: string[] = [];

      projectTags.forEach(tag => {
        const tagWords = tag.label.toLowerCase().split(' ');
        let tagMatched = false;

        tagWords.forEach(word => {
          if (text.includes(word) && word.length > 2) {
            relevanceScore += 1;
            tagMatched = true;
          }
        });

        if (tagMatched) {
          matchedTags.push(tag.label);
        }
      });

      return { ...suggestion, relevanceScore, matchedTags };
    });

    scoredSuggestions.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    return scoredSuggestions;
  };

  // Filter suggestions when suggestions or projectTags change
  useEffect(() => {
    filterSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, projectTags]);

  if (filteredSuggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isLoading ? (
            <svg className="w-4 h-4 text-dark-accent-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-dark-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          <h2 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider">
            Smart Suggestions ({filteredSuggestions.length})
            {aiService.isAvailable() && (
              <span className="ml-2 text-[10px] text-dark-accent-primary font-normal">AI</span>
            )}
          </h2>
        </div>
        <svg
          className={`w-4 h-4 text-dark-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isExpanded && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-dark-border scrollbar-track-transparent">
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              className="flex-shrink-0 w-64 group bg-dark-surface/50 rounded-lg p-3 border border-dark-accent-primary/20
                         hover:border-dark-accent-primary/40 transition-all animate-slide-in-right"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="flex flex-col gap-2 h-full">
                {/* Title */}
                <p className="text-sm text-dark-text-primary line-clamp-2 flex-1">
                  {suggestion.title}
                </p>

                {/* Matched project tags */}
                {suggestion.matchedTags && suggestion.matchedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {suggestion.matchedTags.map((tagLabel, idx) => {
                      const tag = projectTags.find(t => t.label === tagLabel);
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: `${tag?.color || '#666'}20`,
                            color: tag?.color || '#666',
                          }}
                        >
                          {tagLabel}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Source badge and context */}
                <div className="flex flex-col gap-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded self-start ${getSourceColor(suggestion.source)}`}>
                    {getSourceLabel(suggestion.source)}
                  </span>
                  {suggestion.context && (
                    <span className="text-xs text-dark-text-muted truncate">
                      {suggestion.context}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 pt-2 border-t border-dark-border">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTask(suggestion);
                    }}
                    className="flex-1 px-2 py-1 text-xs text-dark-accent-success hover:bg-dark-accent-success/10 rounded transition-all"
                    title="Add to tasks"
                  >
                    Add Task
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(suggestion.id);
                    }}
                    className="p-1 text-dark-text-muted hover:bg-dark-text-muted/10 rounded transition-all"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
