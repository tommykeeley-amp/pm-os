import { ReactNode } from 'react';

interface TabPanelProps {
  children: ReactNode;
  isActive: boolean;
  className?: string;
}

/**
 * TabPanel Component
 *
 * A reusable animated container for tab content.
 * Provides smooth fade-in/slide-up animation when tab becomes active.
 *
 * @example
 * <TabPanel isActive={activeTab === 'tasks'}>
 *   <TaskList />
 * </TabPanel>
 */
export default function TabPanel({ children, isActive, className = '' }: TabPanelProps) {
  if (!isActive) return null;

  return (
    <div className={`tab-panel ${className}`}>
      {children}
    </div>
  );
}
