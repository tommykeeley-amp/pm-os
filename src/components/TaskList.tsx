import { format, isToday, isTomorrow, isPast, parseISO, formatDistanceToNow } from 'date-fns';
import type { Task } from '../types/task';

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateJiraTicket?: (task: Task) => void;
  jiraConfigured?: boolean;
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'calendar':
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'email':
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'slack':
      return (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
      );
    default:
      return null;
  }
}

function getDueDateDisplay(dueDate?: string) {
  if (!dueDate) return null;

  const date = parseISO(dueDate);
  const isOverdue = isPast(date) && !isToday(date);

  let displayText = '';
  let colorClass = 'text-dark-text-muted';

  if (isToday(date)) {
    displayText = 'Today';
    colorClass = 'text-dark-accent-warning';
  } else if (isTomorrow(date)) {
    displayText = 'Tomorrow';
    colorClass = 'text-dark-text-secondary';
  } else if (isOverdue) {
    displayText = format(date, 'MMM d');
    colorClass = 'text-dark-accent-danger';
  } else {
    displayText = format(date, 'MMM d');
    colorClass = 'text-dark-text-muted';
  }

  return (
    <span className={`text-xs ${colorClass}`}>
      {displayText}
    </span>
  );
}

function getTaskTooltip(task: Task): string {
  const createdDate = parseISO(task.createdAt);
  const createdFormatted = format(createdDate, 'MMM d, yyyy \'at\' h:mm a');
  const createdRelative = formatDistanceToNow(createdDate, { addSuffix: true });

  let tooltip = `Created: ${createdFormatted} (${createdRelative})`;

  if (task.updatedAt) {
    const updatedDate = parseISO(task.updatedAt);
    const updatedFormatted = format(updatedDate, 'MMM d, yyyy \'at\' h:mm a');
    const updatedRelative = formatDistanceToNow(updatedDate, { addSuffix: true });
    tooltip += `\nLast updated: ${updatedFormatted} (${updatedRelative})`;
  }

  return tooltip;
}

export default function TaskList({ tasks, onToggle, onDelete, onCreateJiraTicket, jiraConfigured }: TaskListProps) {
  return (
    <div className="space-y-1">
      {tasks.map((task, index) => (
        <div
          key={task.id}
          className="task-item group bg-dark-surface rounded-lg px-3 py-2.5 border border-dark-border
                     hover:border-dark-border/60 transition-all animate-slide-in-right cursor-pointer"
          style={{ animationDelay: `${index * 30}ms` }}
          title={getTaskTooltip(task)}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onToggle(task.id)}
              className="mt-0.5 flex-shrink-0 cursor-pointer"
            />

            {/* Task content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm ${
                  task.completed
                    ? 'text-dark-text-muted line-through'
                    : 'text-dark-text-primary'
                }`}>
                  {task.title}
                </p>

                {/* Action buttons (show on hover) */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  {/* Jira button */}
                  {jiraConfigured && onCreateJiraTicket && (
                    <button
                      onClick={() => onCreateJiraTicket(task)}
                      className="text-dark-text-muted hover:text-blue-400 transition-colors flex-shrink-0"
                      title="Create Jira ticket"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84a.84.84 0 0 0-.84-.84H11.53zM2 11.53c0-2.4 1.97-4.35 4.35-4.35h1.78v-1.7c0-2.4 1.94-4.34 4.34-4.34V11.69a.84.84 0 0 1-.84.84H2zm9.53 9.47c0-2.4-1.97-4.35-4.35-4.35H5.4v-1.7c0-2.4-1.94-4.34-4.34-4.34v9.55c0 .46.37.84.84.84h9.63z"/>
                      </svg>
                    </button>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={() => onDelete(task.id)}
                    className="text-dark-text-muted hover:text-dark-accent-danger transition-colors flex-shrink-0"
                    title="Delete task"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Task metadata */}
              {(task.source !== 'manual' || task.dueDate || task.context) && (
                <div className="flex items-center gap-2 mt-1.5">
                  {/* Source icon */}
                  {task.source !== 'manual' && (
                    <span className="text-dark-text-muted">
                      {getSourceIcon(task.source)}
                    </span>
                  )}

                  {/* Due date */}
                  {getDueDateDisplay(task.dueDate)}

                  {/* Context */}
                  {task.context && (
                    <span className="text-xs text-dark-text-muted truncate">
                      {task.context}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
