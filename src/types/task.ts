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
