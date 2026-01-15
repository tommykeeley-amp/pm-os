interface Suggestion {
  id: string;
  title: string;
  source: string;
  context?: string;
  priority?: string;
  dueDate?: string;
}

interface SmartSuggestionsProps {
  suggestions: Suggestion[];
  onAddTask: (suggestion: Suggestion) => void;
  onDismiss: (id: string) => void;
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
}: SmartSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-dark-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h2 className="text-xs font-semibold text-dark-text-secondary uppercase tracking-wider">
          Smart Suggestions
        </h2>
      </div>

      <div className="space-y-1.5">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.id}
            className="group bg-dark-surface/50 rounded-lg px-3 py-2.5 border border-dark-accent-primary/20
                       hover:border-dark-accent-primary/40 transition-all animate-slide-in-right"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm text-dark-text-primary">
                    {suggestion.title}
                  </p>
                </div>

                {(suggestion.context || suggestion.source) && (
                  <div className="flex items-center gap-2">
                    {/* Source badge */}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getSourceColor(suggestion.source)}`}>
                      {getSourceLabel(suggestion.source)}
                    </span>

                    {/* Context */}
                    {suggestion.context && (
                      <span className="text-xs text-dark-text-muted truncate">
                        {suggestion.context}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onAddTask(suggestion)}
                  className="p-1 text-dark-accent-success hover:bg-dark-accent-success/10 rounded transition-all"
                  title="Add to tasks"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>

                <button
                  onClick={() => onDismiss(suggestion.id)}
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
    </div>
  );
}
