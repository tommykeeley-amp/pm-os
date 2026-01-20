import { useState, useRef, useEffect } from 'react';
import { format, isToday, isTomorrow, isPast, parseISO, formatDistanceToNow } from 'date-fns';
import type { Task, LinkedItem } from '../types/task';
import LinkedDocsSelector from './LinkedDocsSelector';

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateTask?: (id: string, updates: Partial<Task>) => Promise<void>;
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
    displayText = format(date, 'EEE, MMM d');
    colorClass = 'text-dark-accent-danger';
  } else {
    displayText = format(date, 'EEE, MMM d');
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

export default function TaskList({ tasks, onToggle, onDelete, onUpdateTask, onLinkSlackChannel, slackConfigured, onTaskClick, onDragStart, onDragEnd }: TaskListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [datePickerOpenId, setDatePickerOpenId] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Auto-open date picker when it becomes visible
  useEffect(() => {
    if (datePickerOpenId && dateInputRef.current) {
      try {
        dateInputRef.current.showPicker();
      } catch (error) {
        // showPicker() may not be supported in all browsers
        console.log('showPicker not supported');
      }
    }
  }, [datePickerOpenId]);

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
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${
                    task.completed
                      ? 'text-dark-text-muted line-through'
                      : 'text-dark-text-primary'
                  }`}>
                    {task.title}
                  </p>
                </div>

                {/* Actions dropdown */}
                <div className="actions-menu relative opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
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
                        {slackConfigured && (
                          <>
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
              {(task.source !== 'manual' || task.context || task.tags?.length) && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {/* Source icon */}
                  {task.source !== 'manual' && (
                    <span className="text-dark-text-muted">
                      {getSourceIcon(task.source)}
                    </span>
                  )}

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

              {/* Linked Docs and Date row */}
              {(onUpdateTask || task.deadline || task.dueDate) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  {onUpdateTask && (
                    <div className="flex-1 min-w-0">
                      <LinkedDocsSelector
                        linkedItems={task.linkedItems}
                        taskTags={task.tags}
                        onAddLink={(item: LinkedItem) => {
                          const updatedLinkedItems = [...(task.linkedItems || []), item];
                          onUpdateTask(task.id, { linkedItems: updatedLinkedItems });
                        }}
                        onRemoveLink={(itemId: string) => {
                          const updatedLinkedItems = (task.linkedItems || []).filter(item => item.id !== itemId);
                          onUpdateTask(task.id, { linkedItems: updatedLinkedItems });
                        }}
                        allowRemove={false}
                      />
                    </div>
                  )}
                  {/* Due date - bottom right aligned with docs */}
                  {(task.deadline || task.dueDate) && (
                    <div className="flex-shrink-0 ml-auto relative">
                      {datePickerOpenId === task.id ? (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setDatePickerOpenId(null)}
                          />
                          <input
                            ref={dateInputRef}
                            type="date"
                            value={task.deadline || task.dueDate || ''}
                            onChange={(e) => {
                              if (onUpdateTask) {
                                onUpdateTask(task.id, { deadline: e.target.value });
                              }
                              setDatePickerOpenId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => setDatePickerOpenId(null)}
                            className="relative z-20 px-2 py-1 text-xs bg-dark-surface border border-dark-accent-primary rounded
                                     text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-dark-accent-primary
                                     cursor-pointer [color-scheme:dark]"
                            autoFocus
                          />
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDatePickerOpenId(task.id);
                          }}
                          className="hover:opacity-80 transition-opacity"
                        >
                          {getDueDateDisplay(task.deadline || task.dueDate)}
                        </button>
                      )}
                    </div>
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
