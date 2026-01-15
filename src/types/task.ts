export type TaskSource = 'manual' | 'calendar' | 'email' | 'slack';
export type TaskPriority = 'low' | 'medium' | 'high';

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
