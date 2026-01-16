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

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadIssueTypes(selectedProject);
    }
  }, [selectedProject]);

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

  const handleCreate = async () => {
    if (!summary || !selectedProject || !selectedIssueType) {
      setError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const result = await window.electronAPI.jiraCreateIssue({
        summary,
        description,
        projectKey: selectedProject,
        issueType: selectedIssueType,
      });

      onSuccess(result.key, result.url);
    } catch (err: any) {
      setError('Failed to create ticket: ' + err.message);
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center animate-fade-in z-50">
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-lg mx-4 animate-slide-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-text-primary">Create Jira Ticket</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <label className="text-sm font-medium text-dark-text-secondary mb-1.5 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-dark-bg text-dark-text-primary border border-dark-border rounded-lg px-3 py-2
                         focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                         transition-all outline-none resize-none"
              placeholder="Enter ticket description"
              disabled={isCreating}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1 px-4 py-2 bg-dark-accent-primary hover:bg-dark-accent-primary/90
                         text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Ticket'}
            </button>
            <button
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 bg-dark-bg hover:bg-dark-border/20 text-dark-text-secondary
                         rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
