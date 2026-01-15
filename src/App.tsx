import { useState, useEffect } from 'react';
import TaskInput from './components/TaskInput';
import TaskList from './components/TaskList';
import SmartSuggestions from './components/SmartSuggestions';
import Integrations from './components/Integrations';
import JiraTicketModal from './components/JiraTicketModal';
import type { Task } from './types/task';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [jiraConfigured, setJiraConfigured] = useState(false);
  const [jiraTicketTask, setJiraTicketTask] = useState<Task | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load settings
      const settings = await window.electronAPI.getSettings();
      setIsPinned(settings.windowPosition?.isPinned || false);

      // Load tasks
      const loadedTasks = await window.electronAPI.getTasks();
      setTasks(loadedTasks || []);

      // Load smart suggestions
      const smartSuggestions = await window.electronAPI.getSmartSuggestions();
      setSuggestions(smartSuggestions || []);

      // Check if Jira is configured
      const jiraIsConfigured = await window.electronAPI.jiraIsConfigured();
      setJiraConfigured(jiraIsConfigured);

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setIsLoading(false);
    }
  };

  const handleAddTask = async (title: string) => {
    const newTask: Partial<Task> = {
      title,
      completed: false,
      source: 'manual',
      priority: 'medium',
      createdAt: new Date().toISOString(),
    };

    try {
      const addedTask = await window.electronAPI.addTask(newTask);
      setTasks([addedTask, ...tasks]);
    } catch (error) {
      console.error('Failed to add task:', error);
    }
  };

  const handleToggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    try {
      await window.electronAPI.updateTask(id, { completed: !task.completed });
      setTasks(tasks.map(t =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ));
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await window.electronAPI.deleteTask(id);
      setTasks(tasks.filter(t => t.id !== id));
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleTogglePin = async () => {
    const newPinState = !isPinned;
    try {
      await window.electronAPI.pinWindow(newPinState);
      setIsPinned(newPinState);
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleCreateJiraTicket = (task: Task) => {
    setJiraTicketTask(task);
  };

  const handleJiraTicketSuccess = (issueKey: string, issueUrl: string) => {
    setJiraTicketTask(null);
    alert(`Jira ticket created successfully!\n\n${issueKey}\n\nClick OK to open: ${issueUrl}`);
    // Optionally open the URL in browser
    if (confirm('Open ticket in browser?')) {
      window.open(issueUrl, '_blank');
    }
  };

  const handleAddFromSuggestion = async (suggestion: any) => {
    const newTask: Partial<Task> = {
      title: suggestion.title,
      completed: false,
      source: suggestion.source,
      sourceId: suggestion.id,
      priority: suggestion.priority || 'medium',
      context: suggestion.context,
      dueDate: suggestion.dueDate,
      createdAt: new Date().toISOString(),
    };

    try {
      const addedTask = await window.electronAPI.addTask(newTask);
      setTasks([addedTask, ...tasks]);
      // Remove from suggestions
      setSuggestions(suggestions.filter(s => s.id !== suggestion.id));
    } catch (error) {
      console.error('Failed to add task from suggestion:', error);
    }
  };

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  return (
    <div className="w-screen h-screen bg-dark-bg animate-fade-in">
      {/* Header with drag region */}
      <div className="drag-region bg-dark-surface border-b border-dark-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-dark-accent-primary"></div>
          <h1 className="text-sm font-semibold text-dark-text-primary no-drag">PM-OS</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIntegrations(true)}
            className="no-drag p-1.5 hover:bg-dark-bg rounded transition-colors"
            title="Integrations"
          >
            <svg
              className="w-4 h-4 text-dark-text-secondary hover:text-dark-text-primary transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </button>
          <button
            onClick={handleTogglePin}
            className="no-drag p-1.5 hover:bg-dark-bg rounded transition-colors"
            title={isPinned ? 'Unpin window' : 'Pin to right side'}
          >
            <svg
              className={`w-4 h-4 transition-colors ${
                isPinned ? 'text-dark-accent-primary' : 'text-dark-text-secondary'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="h-[calc(100vh-57px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-dark-text-secondary">Loading...</div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Quick add input */}
            <TaskInput onAddTask={handleAddTask} />

            {/* Smart suggestions */}
            {suggestions.length > 0 && (
              <SmartSuggestions
                suggestions={suggestions}
                onAddTask={handleAddFromSuggestion}
                onDismiss={(id) => setSuggestions(suggestions.filter(s => s.id !== id))}
              />
            )}

            {/* Active tasks */}
            {activeTasks.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-dark-text-secondary mb-2 uppercase tracking-wider">
                  Active Tasks
                </h2>
                <TaskList
                  tasks={activeTasks}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  onCreateJiraTicket={handleCreateJiraTicket}
                  jiraConfigured={jiraConfigured}
                />
              </div>
            )}

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-dark-text-secondary mb-2 uppercase tracking-wider">
                  Completed
                </h2>
                <TaskList
                  tasks={completedTasks}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  onCreateJiraTicket={handleCreateJiraTicket}
                  jiraConfigured={jiraConfigured}
                />
              </div>
            )}

            {/* Empty state */}
            {tasks.length === 0 && suggestions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-dark-text-muted mb-2">No tasks yet</div>
                <div className="text-xs text-dark-text-muted">
                  Add a task above or connect your integrations
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Integrations modal */}
      {showIntegrations && (
        <Integrations onClose={() => setShowIntegrations(false)} />
      )}

      {/* Jira ticket modal */}
      {jiraTicketTask && (
        <JiraTicketModal
          task={jiraTicketTask}
          onClose={() => setJiraTicketTask(null)}
          onSuccess={handleJiraTicketSuccess}
        />
      )}
    </div>
  );
}

export default App;
