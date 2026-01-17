import { useState } from 'react';

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

  // Filter suggestions based on project tag relevance
  const filterByProjectTags = (suggestions: Suggestion[]): Suggestion[] => {
    if (projectTags.length === 0) {
      // No tags, return top 5 suggestions
      return suggestions.slice(0, 5);
    }

    // Score each suggestion based on tag keyword matching
    const scoredSuggestions = suggestions.map(suggestion => {
      const text = `${suggestion.title} ${suggestion.context || ''}`.toLowerCase();
      let relevanceScore = 0;

      // Check how many project tags are mentioned in the suggestion
      projectTags.forEach(tag => {
        const tagWords = tag.label.toLowerCase().split(' ');
        tagWords.forEach(word => {
          if (text.includes(word) && word.length > 2) { // Ignore very short words
            relevanceScore += 1;
          }
        });
      });

      return { ...suggestion, relevanceScore };
    });

    // Sort by relevance score, then by original order
    scoredSuggestions.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return 0;
    });

    // Return top 5 most relevant
    return scoredSuggestions.slice(0, 5);
  };

  const filteredSuggestions = filterByProjectTags(suggestions);

  if (filteredSuggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-dark-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h2 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider">
            Smart Suggestions ({filteredSuggestions.length})
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

                {/* Source badge and context */}
                {(suggestion.context || suggestion.source) && (
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
                )}

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
