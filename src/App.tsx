import { useState, useEffect } from 'react';
import { startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';
import TaskInput from './components/TaskInput';
import TaskList from './components/TaskList';
import SmartSuggestions from './components/SmartSuggestions';
import JiraTicketModal from './components/JiraTicketModal';
import ConfluenceDocModal from './components/ConfluenceDocModal';
import TaskDetailModal from './components/TaskDetailModal';
import Settings from './components/Settings';
import Meetings from './components/Meetings';
import Chats from './components/Chats';
import TabPanel from './components/TabPanel';
import type { Task } from './types/task';

type Tab = 'tasks' | 'meetings' | 'chats';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [jiraConfigured, setJiraConfigured] = useState(false);
  const [confluenceConfigured, setConfluenceConfigured] = useState(false);
  const [slackConfigured] = useState(false);
  const [jiraTicketTask, setJiraTicketTask] = useState<Task | null>(null);
  const [confluenceDocTask, setConfluenceDocTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadInitialData();

    // Listen for open-settings event from Meetings component
    const handleOpenSettings = () => setShowSettings(true);
    window.addEventListener('open-settings', handleOpenSettings);

    // Listen for OAuth success to reload smart suggestions
    const handleOAuthSuccess = (data: { provider: string }) => {
      if (data.provider === 'google' || data.provider === 'slack') {
        console.log('[App] OAuth success, reloading smart suggestions...');
        // Reload smart suggestions
        window.electronAPI.getSmartSuggestions().then(smartSuggestions => {
          setSuggestions(smartSuggestions || []);
        });
      }
    };

    window.electronAPI.onOAuthSuccess?.(handleOAuthSuccess);

    return () => {
      window.removeEventListener('open-settings', handleOpenSettings);
    };
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

      // Check if Confluence is configured
      const confluenceIsConfigured = await window.electronAPI.confluenceIsConfigured();
      setConfluenceConfigured(confluenceIsConfigured);

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
      // Automatically open the detail modal for the newly created task
      setDetailTask(addedTask);
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

  const handleCreateConfluenceDoc = (task: Task) => {
    setConfluenceDocTask(task);
  };

  const handleConfluenceDocSuccess = (pageId: string, pageUrl: string) => {
    setConfluenceDocTask(null);
    alert(`Confluence page created successfully!\n\nPage ID: ${pageId}\n\nClick OK to open: ${pageUrl}`);
    // Optionally open the URL in browser
    if (confirm('Open page in browser?')) {
      window.open(pageUrl, '_blank');
    }
  };

  const handleLinkSlackChannel = (task: Task) => {
    // TODO: Implement Slack channel linking
    console.log('Link Slack channel for task:', task);
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      await window.electronAPI.updateTask(taskId, updates);
      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, ...updates } : t
      ));
    } catch (error) {
      console.error('Failed to update task:', error);
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
      // Automatically open the detail modal for the newly created task
      setDetailTask(addedTask);
    } catch (error) {
      console.error('Failed to add task from suggestion:', error);
    }
  };

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  // Categorize active tasks by this week vs backlog
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 }); // Saturday

  const thisWeekTasks = activeTasks.filter(task => {
    if (!task.deadline) return false;
    try {
      const deadline = parseISO(task.deadline);
      return isWithinInterval(deadline, { start: weekStart, end: weekEnd });
    } catch {
      return false;
    }
  });

  const backlogTasks = activeTasks.filter(task => {
    if (!task.deadline) return true; // No deadline = backlog
    try {
      const deadline = parseISO(task.deadline);
      return !isWithinInterval(deadline, { start: weekStart, end: weekEnd });
    } catch {
      return true;
    }
  });

  return (
    <div className="relative w-screen h-screen bg-dark-bg animate-fade-in">
      {/* Header with drag region */}
      <div className="drag-region bg-dark-surface border-b border-dark-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse-glow"></div>
          <h1 className="text-sm font-semibold text-dark-text-primary no-drag">PM-OS</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="no-drag p-1.5 hover:bg-dark-bg rounded transition-colors"
            title="Settings"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
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
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="no-drag p-1.5 hover:bg-dark-bg rounded transition-colors"
            title="Minimize"
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
                d="M20 12H4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-dark-surface border-b border-dark-border flex">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative
                   ${activeTab === 'tasks'
                     ? 'text-dark-text-primary'
                     : 'text-dark-text-secondary hover:text-dark-text-primary'}`}
        >
          Tasks
          {activeTab === 'tasks' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-accent-primary animate-slide-in"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('meetings')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative
                   ${activeTab === 'meetings'
                     ? 'text-dark-text-primary'
                     : 'text-dark-text-secondary hover:text-dark-text-primary'}`}
        >
          Meetings
          {activeTab === 'meetings' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-accent-primary animate-slide-in"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative
                   ${activeTab === 'chats'
                     ? 'text-dark-text-primary'
                     : 'text-dark-text-secondary hover:text-dark-text-primary'}`}
        >
          Chats
          {activeTab === 'chats' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-accent-primary animate-slide-in"></div>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="h-[calc(100vh-57px-49px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-dark-text-secondary">Loading...</div>
          </div>
        ) : (
          <>
            {/* Tasks Tab */}
            <TabPanel isActive={activeTab === 'tasks'} className="p-4 space-y-4">
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

            {/* This Week's Tasks */}
            {thisWeekTasks.length > 0 && (
              <div>
                <h2 className="section-header">
                  This Week's Tasks
                </h2>
                <TaskList
                  tasks={thisWeekTasks}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  onCreateJiraTicket={handleCreateJiraTicket}
                  jiraConfigured={jiraConfigured}
                  onCreateConfluenceDoc={handleCreateConfluenceDoc}
                  confluenceConfigured={confluenceConfigured}
                  onLinkSlackChannel={handleLinkSlackChannel}
                  slackConfigured={slackConfigured}
                  onTaskClick={setDetailTask}
                />
              </div>
            )}

            {/* Backlog Tasks */}
            {backlogTasks.length > 0 && (
              <div>
                <h2 className="section-header">
                  Backlog of Tasks
                </h2>
                <TaskList
                  tasks={backlogTasks}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  onCreateJiraTicket={handleCreateJiraTicket}
                  jiraConfigured={jiraConfigured}
                  onCreateConfluenceDoc={handleCreateConfluenceDoc}
                  confluenceConfigured={confluenceConfigured}
                  onLinkSlackChannel={handleLinkSlackChannel}
                  slackConfigured={slackConfigured}
                  onTaskClick={setDetailTask}
                />
              </div>
            )}

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <div>
                <h2 className="section-header">
                  Completed
                </h2>
                <TaskList
                  tasks={completedTasks}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  onCreateJiraTicket={handleCreateJiraTicket}
                  jiraConfigured={jiraConfigured}
                  onCreateConfluenceDoc={handleCreateConfluenceDoc}
                  confluenceConfigured={confluenceConfigured}
                  onLinkSlackChannel={handleLinkSlackChannel}
                  slackConfigured={slackConfigured}
                  onTaskClick={setDetailTask}
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
            </TabPanel>

            {/* Meetings Tab */}
            <TabPanel isActive={activeTab === 'meetings'} className="p-4">
              <Meetings isPinned={isPinned} />
            </TabPanel>

            {/* Chats Tab */}
            <TabPanel isActive={activeTab === 'chats'} className="p-4">
              <Chats isPinned={isPinned} />
            </TabPanel>
          </>
        )}
      </div>

      {/* Settings full-screen view */}
      {showSettings && (
        <div className="absolute inset-0 z-50 animate-fade-in">
          <Settings onClose={() => setShowSettings(false)} />
        </div>
      )}

      {/* Jira ticket modal */}
      {jiraTicketTask && (
        <JiraTicketModal
          task={jiraTicketTask}
          onClose={() => setJiraTicketTask(null)}
          onSuccess={handleJiraTicketSuccess}
        />
      )}

      {/* Confluence doc modal */}
      {confluenceDocTask && (
        <ConfluenceDocModal
          task={confluenceDocTask}
          onClose={() => setConfluenceDocTask(null)}
          onSuccess={handleConfluenceDocSuccess}
        />
      )}

      {/* Task detail full-screen view */}
      {detailTask && (
        <div className="absolute inset-0 z-50 animate-fade-in">
          <TaskDetailModal
            task={detailTask}
            existingTags={tasks.flatMap(t => t.tags || [])}
            onClose={() => setDetailTask(null)}
            onSave={(updates) => {
              handleUpdateTask(detailTask.id, updates);
              // Update the detailTask state to reflect changes immediately
              setDetailTask({ ...detailTask, ...updates });
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
