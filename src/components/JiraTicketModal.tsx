import { useState, useEffect } from 'react';
import type { Task } from '../types/task';

interface JiraTicketModalProps {
  task: Task;
  onClose: () => void;
  onSuccess: (issueKey: string, issueUrl: string) => void;
}

export default function JiraTicketModal({ task, onClose, onSuccess }: JiraTicketModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedIssueType, setSelectedIssueType] = useState('');
  const [summary, setSummary] = useState(task.title);
  const [description, setDescription] = useState(task.context || '');
  const [error, setError] = useState('');
  const [isFetchingThread, setIsFetchingThread] = useState(false);
  const [threadFetched, setThreadFetched] = useState(false);
  const [userSettings, setUserSettings] = useState<any>(null);

  // Fields you actually use - initialize from jiraMetadata if available
  const [priority, setPriority] = useState(task.jiraMetadata?.priority || 'Medium');
  const [pillar, setPillar] = useState('');
  const [pod, setPod] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<Array<{ accountId: string; displayName: string; emailAddress: string }>>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<{ accountId: string; displayName: string; emailAddress: string } | null>(
    task.jiraMetadata?.assigneeEmail ? {
      accountId: '',
      displayName: task.jiraMetadata.assigneeName || task.jiraMetadata.assigneeEmail,
      emailAddress: task.jiraMetadata.assigneeEmail,
    } : null
  );
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [parentTicket, setParentTicket] = useState(task.jiraMetadata?.parent || '');

  // Check if this task is from Slack and has thread data
  const hasSlackThread = task.source === 'slack' && task.slackThreadTs && task.slackChannelId;

  useEffect(() => {
    loadProjects();
    loadUserSettings();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadIssueTypes(selectedProject);
    }
  }, [selectedProject]);

  // Set default pillar/pod from settings once loaded
  useEffect(() => {
    if (userSettings) {
      // Use user's configured defaults - don't fall back to hardcoded values
      const defaultPillar = userSettings.jiraDefaultPillar || '';
      const defaultPod = userSettings.jiraDefaultPod || '';
      console.log('[JiraTicketModal] Setting defaults from settings:', {
        pillar: defaultPillar,
        pod: defaultPod
      });
      setPillar(defaultPillar);
      setPod(defaultPod);
    }
  }, [userSettings]);

  // Search for assignees when user types
  useEffect(() => {
    if (assigneeSearch.length >= 2 && selectedProject) {
      const timeoutId = setTimeout(() => {
        searchAssignees(assigneeSearch);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setAssigneeResults([]);
      setShowAssigneeDropdown(false);
    }
  }, [assigneeSearch, selectedProject]);

  const loadProjects = async () => {
    try {
      const projectList = await window.electronAPI.jiraGetProjects();
      setProjects(projectList);
      if (projectList.length > 0) {
        // Prepopulate with AMP project if it exists, otherwise use first project
        const ampProject = projectList.find((p: any) => p.key === 'AMP');
        setSelectedProject(ampProject ? ampProject.key : projectList[0].key);
      }
    } catch (err: any) {
      setError('Failed to load projects: ' + err.message);
    }
  };

  const loadUserSettings = async () => {
    try {
      const settings = await window.electronAPI.getUserSettings();
      console.log('[JiraTicketModal] Loaded user settings:', {
        jiraDefaultPillar: settings?.jiraDefaultPillar,
        jiraDefaultPod: settings?.jiraDefaultPod
      });
      setUserSettings(settings);
    } catch (err: any) {
      console.error('[JiraTicketModal] Failed to load user settings:', err);
    }
  };

  const loadIssueTypes = async (projectKey: string) => {
    try {
      const types = await window.electronAPI.jiraGetIssueTypes(projectKey);
      setIssueTypes(types);
      if (types.length > 0) {
        // Prepopulate with Epic if it exists, otherwise use first type
        const epicType = types.find((t: any) => t.name === 'Epic');
        setSelectedIssueType(epicType ? epicType.name : types[0].name);
      }
    } catch (err: any) {
      console.error('Failed to load issue types:', err);
    }
  };

  const searchAssignees = async (query: string) => {
    try {
      const users = await window.electronAPI.jiraSearchUsers(selectedProject, query);
      setAssigneeResults(users);
      setShowAssigneeDropdown(true);
    } catch (err: any) {
      console.error('Failed to search assignees:', err);
    }
  };

  const handleFetchSlackThread = async () => {
    if (!task.slackChannelId || !task.slackThreadTs) return;

    setIsFetchingThread(true);
    setError('');

    try {
      const replies = await window.electronAPI.slackGetThreadReplies(
        task.slackChannelId,
        task.slackThreadTs
      );

      if (replies && replies.length > 0) {
        // Format the thread into a nice description
        let threadDescription = '--- Slack Thread ---\n\n';

        replies.forEach((reply) => {
          threadDescription += `${reply.userName}:\n${reply.text}\n\n`;
        });

        // Add link to original Slack message if available
        if (task.slackPermalink) {
          threadDescription += `\nView in Slack: ${task.slackPermalink}`;
        }

        setDescription(threadDescription);
        setThreadFetched(true);
      } else {
        setError('No thread replies found');
      }
    } catch (err: any) {
      console.error('Failed to fetch Slack thread:', err);
      setError('Failed to fetch Slack thread: ' + err.message);
    } finally {
      setIsFetchingThread(false);
    }
  };

  const handleCreate = async () => {
    if (!summary || !selectedProject || !selectedIssueType) {
      setError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      console.log('[JiraTicketModal] Creating issue with:', {
        summary,
        projectKey: selectedProject,
        issueType: selectedIssueType,
        priority,
        pillar,
        pod,
        parent: parentTicket || undefined,
        assigneeEmail: selectedAssignee?.emailAddress,
      });

      const result = await window.electronAPI.jiraCreateIssue({
        summary,
        description,
        projectKey: selectedProject,
        issueType: selectedIssueType,
        priority,
        pillar,
        pod,
        parent: parentTicket || undefined,
        assigneeEmail: selectedAssignee?.emailAddress,
      });

      console.log('[JiraTicketModal] Issue created successfully:', result);
      onSuccess(result.key, result.url);
    } catch (err: any) {
      console.error('[JiraTicketModal] Error creating issue:', err);
      const errorMessage = err.message || 'Unknown error';
      const statusMatch = errorMessage.match(/(\d{3})/);  // Extract HTTP status code
      const displayError = statusMatch
        ? `Failed to create ticket (HTTP ${statusMatch[1]}): ${errorMessage}`
        : `Failed to create ticket: ${errorMessage}`;
      setError(displayError);
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container w-full max-w-lg mx-4 animate-slide-in">
        {/* Header */}
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-dark-text-primary">Create Jira Ticket</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text-primary transition-colors"
          >
            <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-dark-accent-danger/10 border border-dark-accent-danger/20 rounded-lg p-3">
              <p className="text-sm text-dark-accent-danger">{error}</p>
            </div>
          )}

          {/* Project */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Project *
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              disabled={isCreating}
            >
              {projects.map((project) => (
                <option key={project.key} value={project.key}>
                  {project.name} ({project.key})
                </option>
              ))}
            </select>
          </div>

          {/* Issue Type */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Issue Type *
            </label>
            <select
              value={selectedIssueType}
              onChange={(e) => setSelectedIssueType(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              disabled={isCreating}
            >
              {issueTypes.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Summary *
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              placeholder="Enter ticket summary"
              disabled={isCreating}
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-dark-text-secondary">
                Description
              </label>
              {hasSlackThread && !threadFetched && (
                <button
                  onClick={handleFetchSlackThread}
                  disabled={isFetchingThread || isCreating}
                  className="text-xs px-2 py-1 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 rounded transition-colors disabled:opacity-50"
                  title="Fetch full Slack thread conversation"
                >
                  {isFetchingThread ? (
                    <>
                      <svg className="inline w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Fetching...
                    </>
                  ) : (
                    <>
                      <svg className="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                      </svg>
                      Fetch Slack Thread
                    </>
                  )}
                </button>
              )}
              {threadFetched && (
                <span className="text-xs text-pink-400">
                  ✓ Thread loaded
                </span>
              )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={hasSlackThread ? 8 : 4}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none resize-none"
              placeholder={hasSlackThread ? "Click 'Fetch Slack Thread' to load full conversation" : "Enter ticket description"}
              disabled={isCreating}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              disabled={isCreating}
            >
              <option value="Highest">Highest</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
              <option value="Lowest">Lowest</option>
            </select>
          </div>

          {/* Parent Ticket */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Parent Ticket
            </label>
            <input
              type="text"
              value={parentTicket}
              onChange={(e) => setParentTicket(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              placeholder="e.g., AMP-12345 (optional)"
              disabled={isCreating}
            />
          </div>

          {/* Pillar */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Pillar
            </label>
            <input
              type="text"
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              placeholder="e.g., Growth"
              disabled={isCreating}
            />
          </div>

          {/* Pod */}
          <div>
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Pod
            </label>
            <input
              type="text"
              value={pod}
              onChange={(e) => setPod(e.target.value)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              placeholder="e.g., Growth - Retention"
              disabled={isCreating}
            />
          </div>

          {/* Assignee */}
          <div className="relative">
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Assignee
            </label>
            <input
              type="text"
              value={selectedAssignee ? selectedAssignee.displayName : assigneeSearch}
              onChange={(e) => {
                setAssigneeSearch(e.target.value);
                setSelectedAssignee(null);
              }}
              onFocus={() => assigneeResults.length > 0 && setShowAssigneeDropdown(true)}
              onBlur={() => setTimeout(() => setShowAssigneeDropdown(false), 200)}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none"
              placeholder="Search by name or email"
              disabled={isCreating}
            />
            {showAssigneeDropdown && assigneeResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-dark-surface border border-dark-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {assigneeResults.map((user) => (
                  <button
                    key={user.accountId}
                    onClick={() => {
                      setSelectedAssignee(user);
                      setAssigneeSearch('');
                      setShowAssigneeDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-dark-bg transition-colors text-sm"
                  >
                    <div className="font-medium text-dark-text-primary">{user.displayName}</div>
                    <div className="text-xs text-dark-text-muted">{user.emailAddress}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedAssignee && (
              <p className="text-xs text-dark-text-muted mt-1">
                Assigned to: {selectedAssignee.emailAddress}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1 btn-primary"
            >
              {isCreating ? 'Creating...' : 'Create Ticket'}
            </button>
            <button
              onClick={onClose}
              disabled={isCreating}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
