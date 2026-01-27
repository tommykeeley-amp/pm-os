export type TaskSource = 'manual' | 'calendar' | 'email' | 'slack';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskTag {
  label: string;
  color: string;
}

export type LinkedItemType =
  | 'confluence'
  | 'jira'
  | 'slack'
  | 'google-docs'
  | 'google-slides'
  | 'google-sheets'
  | 'google-calendar'
  | 'obsidian'
  | 'figma'
  | 'gmail'
  | 'amplitude'
  | 'other';

export interface LinkedItem {
  id: string;
  type: LinkedItemType;
  title: string;
  url?: string;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  source: TaskSource;
  sourceId?: string;
  dueDate?: string;
  priority: TaskPriority;
  context?: string;
  createdAt: string;
  updatedAt?: string;
  description?: string;
  tags?: TaskTag[];
  deadline?: string;
  linkedItems?: LinkedItem[];
  // Slack-specific metadata
  slackThreadTs?: string;    // Thread timestamp for fetching replies
  slackPermalink?: string;   // Direct link to Slack message
  slackChannelId?: string;   // Channel ID for API calls
  slackChannelName?: string; // Human-readable channel name
  slackUserId?: string;      // User who sent the message
  slackUserName?: string;    // Human-readable user name
  // Jira confirmation metadata
  pendingJiraConfirmation?: boolean;  // True if this task requires Jira confirmation
  jiraMetadata?: {
    assigneeName?: string;
    assigneeEmail?: string;
    parent?: string;
    priority?: string;
    pillar?: string;
    pod?: string;
  };
}

export interface WindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  isPinned: boolean;
}

export interface AppSettings {
  hotkey: string;
  syncInterval: number;
  windowPosition?: WindowPosition;
}
