import { useState, useEffect, useRef, KeyboardEvent } from 'react';

interface TaskInputProps {
  onAddTask: (title: string) => void;
}

export default function TaskInput({ onAddTask }: TaskInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Listen for global hotkey event to focus input
    console.log('TaskInput: Setting up focus listener');
    const unsubscribe = window.electronAPI.onFocusTaskInput(() => {
      console.log('TaskInput: Received focus event, attempting to focus input');
      if (inputRef.current) {
        inputRef.current.focus();
        console.log('TaskInput: Input focused successfully');
      } else {
        console.error('TaskInput: Input ref is null');
      }
    });

    return () => {
      console.log('TaskInput: Cleaning up focus listener');
      unsubscribe();
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onAddTask(value.trim());
      setValue('');
    } else if (e.key === 'Escape') {
      setValue('');
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add task... (cmd+shift+p)"
        className="w-full bg-dark-surface text-dark-text-primary placeholder-dark-text-muted
                   px-4 py-3 rounded-lg border border-dark-border
                   focus:border-dark-accent-primary focus:ring-1 focus:ring-dark-accent-primary
                   transition-all outline-none"
        autoFocus
      />
      {value && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
          <button
            onClick={() => setValue('')}
            className="text-dark-text-muted hover:text-dark-text-secondary transition-colors"
          >
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
