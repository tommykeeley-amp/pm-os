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
 * Keeps all tabs mounted for faster switching and pre-loading.
 * Uses CSS to show/hide tabs instead of unmounting.
 *
 * @example
 * <TabPanel isActive={activeTab === 'tasks'}>
 *   <TaskList />
 * </TabPanel>
 */
export default function TabPanel({ children, isActive, className = '' }: TabPanelProps) {
  return (
    <div
      className={`tab-panel ${className} ${isActive ? '' : 'hidden'}`}
      style={{ display: isActive ? 'block' : 'none' }}
    >
      {children}
    </div>
  );
}
