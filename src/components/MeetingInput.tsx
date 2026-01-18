import { useState, useEffect, useRef, KeyboardEvent } from 'react';

interface MeetingInputProps {
  onCreateMeeting: (title: string) => void;
  isActive?: boolean;
}

export default function MeetingInput({ onCreateMeeting, isActive }: MeetingInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when tab becomes active
  useEffect(() => {
    if (isActive && inputRef.current) {
      // Small delay to ensure the tab panel is visible
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isActive]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onCreateMeeting(value.trim());
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
        placeholder="Add meeting... (cmd+shift+m)"
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
