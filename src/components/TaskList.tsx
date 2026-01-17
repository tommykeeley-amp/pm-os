import { useState } from 'react';
import { format, isToday, isTomorrow, isPast, parseISO, formatDistanceToNow } from 'date-fns';
import type { Task } from '../types/task';

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateJiraTicket?: (task: Task) => void;
  jiraConfigured?: boolean;
  onCreateConfluenceDoc?: (task: Task) => void;
  confluenceConfigured?: boolean;
  onLinkSlackChannel?: (task: Task) => void;
  slackConfigured?: boolean;
  onTaskClick?: (task: Task) => void;
  onDragStart?: (task: Task) => void;
  onDragEnd?: () => void;
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'calendar':
      return (
        <svg className="icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'email':
      return (
        <svg className="icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'slack':
      return (
        <svg className="icon-xs" fill="currentColor" viewBox="0 0 24 24">
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

export default function TaskList({ tasks, onToggle, onDelete, onCreateJiraTicket, jiraConfigured, onCreateConfluenceDoc, confluenceConfigured, onLinkSlackChannel, slackConfigured, onTaskClick, onDragStart, onDragEnd }: TaskListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {tasks.map((task, index) => (
        <div
          key={task.id}
          draggable
          onDragStart={(e) => {
            if (onDragStart) {
              onDragStart(task);
              e.dataTransfer.effectAllowed = 'move';
            }
          }}
          onDragEnd={() => {
            if (onDragEnd) {
              onDragEnd();
            }
          }}
          className="task-item group bg-dark-surface rounded-lg px-3 py-2.5 border border-dark-border
                     hover:border-dark-border/60 transition-all animate-slide-in-right cursor-move"
          style={{ animationDelay: `${index * 30}ms` }}
          title={getTaskTooltip(task)}
          onClick={(e) => {
            // Only open detail modal if not clicking on checkbox or actions
            if (
              onTaskClick &&
              !(e.target as HTMLElement).closest('input[type="checkbox"]') &&
              !(e.target as HTMLElement).closest('.actions-menu')
            ) {
              onTaskClick(task);
            }
          }}
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

                {/* Actions dropdown */}
                <div className="actions-menu relative opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === task.id ? null : task.id);
                    }}
                    className="text-dark-text-muted hover:text-dark-text-primary transition-colors flex-shrink-0 p-1"
                    title="Actions"
                  >
                    <svg className="icon-sm" fill="currentColor" viewBox="0 0 16 16">
                      <circle cx="8" cy="3" r="1.5"/>
                      <circle cx="8" cy="8" r="1.5"/>
                      <circle cx="8" cy="13" r="1.5"/>
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {openMenuId === task.id && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenMenuId(null)}
                      />

                      <div className="dropdown-menu right-0 top-8">
                        {/* Integrations section */}
                        {(confluenceConfigured || jiraConfigured || slackConfigured) && (
                          <>
                            {confluenceConfigured && onCreateConfluenceDoc && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCreateConfluenceDoc(task);
                                  setOpenMenuId(null);
                                }}
                                className="dropdown-item"
                              >
                                <svg className="icon-sm" fill="currentColor" viewBox="0 0 225 225">
                                  <path d="M 43 16 L 15 66 L 16 73 L 74 107 L 55 117 L 37 134 L 14 174 L 16 182 L 60 207 L 70 210 L 76 206 L 91 178 L 99 172 L 104 172 L 173 210 L 181 208 L 209 158 L 208 151 L 150 117 L 173 104 L 187 90 L 210 50 L 208 42 L 164 17 L 154 14 L 148 18 L 133 46 L 125 52 L 120 52 L 51 14 Z M 36 170 L 38 168 L 48 149 L 62 134 L 75 126 L 77 126 L 83 123 L 90 122 L 91 121 L 112 121 L 113 122 L 123 124 L 134 129 L 136 131 L 143 134 L 145 136 L 163 145 L 165 147 L 172 150 L 174 152 L 181 155 L 187 159 L 187 162 L 185 164 L 182 171 L 180 173 L 177 180 L 175 182 L 172 188 L 169 188 L 167 186 L 149 177 L 147 175 L 120 161 L 118 159 L 108 155 L 95 155 L 85 159 L 77 167 L 67 186 L 65 188 L 62 188 L 60 186 L 36 173 Z M 37 65 L 37 62 L 39 60 L 42 53 L 44 51 L 47 44 L 49 42 L 52 36 L 55 36 L 57 38 L 75 47 L 77 49 L 104 63 L 106 65 L 116 69 L 129 69 L 130 68 L 135 67 L 140 64 L 147 57 L 157 38 L 159 36 L 162 36 L 164 38 L 171 41 L 173 43 L 180 46 L 182 48 L 188 51 L 188 54 L 186 56 L 176 75 L 162 90 L 149 98 L 147 98 L 141 101 L 134 102 L 133 103 L 112 103 L 111 102 L 107 102 L 106 101 L 101 100 L 90 95 L 88 93 L 81 90 L 79 88 L 72 85 L 70 83 L 63 80 L 61 78 L 52 74 L 50 72 L 43 69 Z" fillRule="evenodd" />
                                </svg>
                                Link Confluence
                              </button>
                            )}

                            {jiraConfigured && onCreateJiraTicket && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCreateJiraTicket(task);
                                  setOpenMenuId(null);
                                }}
                                className="dropdown-item"
                              >
                                <svg className="icon-sm" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 256 256">
                                  <path d="M 150 28 H 220 V 98 C 220 122 198 122 186 110 L 150 74 C 138 62 138 28 150 28 Z"/>
                                  <path d="M 86 84 H 156 V 154 C 156 178 134 178 122 166 L 86 130 C 74 118 74 84 86 84 Z"/>
                                  <path d="M 28 142 H 98 V 212 C 98 236 76 236 64 224 L 28 188 C 16 176 16 142 28 142 Z"/>
                                </svg>
                                Link Jira
                              </button>
                            )}

                            {slackConfigured && onLinkSlackChannel && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onLinkSlackChannel(task);
                                  setOpenMenuId(null);
                                }}
                                className="dropdown-item"
                              >
                                <svg className="icon-sm" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                                </svg>
                                Link Channel
                              </button>
                            )}

                            {/* Separator */}
                            <div className="divider" />
                          </>
                        )}

                        {/* Delete section */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task.id);
                            setOpenMenuId(null);
                          }}
                          className="dropdown-item-danger"
                        >
                          <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Task metadata */}
              {(task.source !== 'manual' || task.dueDate || task.context || task.tags?.length) && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {/* Source icon */}
                  {task.source !== 'manual' && (
                    <span className="text-dark-text-muted">
                      {getSourceIcon(task.source)}
                    </span>
                  )}

                  {/* Due date */}
                  {getDueDateDisplay(task.dueDate)}

                  {/* Tags */}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {task.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  )}

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
