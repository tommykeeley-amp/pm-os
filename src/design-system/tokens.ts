/**
 * PM-OS Design System Tokens
 *
 * These tokens should be used when you need design values in JavaScript/TypeScript.
 * For CSS/Tailwind, use the Tailwind classes directly (e.g., `bg-dark-accent-primary`).
 */

/** Animation durations in milliseconds */
export const DURATION = {
  /** Fast transitions (100ms) - for hover effects, quick feedback */
  FAST: 100,
  /** Normal transitions (150ms) - default for most animations */
  NORMAL: 150,
  /** Slow transitions (300ms) - for complex animations, page transitions */
  SLOW: 300,
} as const;

/** Z-index layers for stacking contexts */
export const Z_INDEX = {
  /** Base layer - normal document flow */
  BASE: 0,
  /** Dropdown menus, tooltips */
  DROPDOWN: 10,
  /** Modal dialogs, overlays */
  MODAL: 50,
  /** Toast notifications, alerts */
  TOAST: 100,
} as const;

/** Spacing values in pixels (for JS calculations) */
export const SPACING = {
  /** Extra small - 8px */
  XS: 8,
  /** Small - 12px */
  SM: 12,
  /** Medium - 16px */
  MD: 16,
  /** Large - 24px */
  LG: 24,
  /** Extra large - 32px */
  XL: 32,
  /** Extra extra large - 48px */
  XXL: 48,
} as const;

/** Border radius values in pixels */
export const RADIUS = {
  /** Small radius - 4px */
  SM: 4,
  /** Medium radius - 8px */
  MD: 8,
  /** Large radius - 12px */
  LG: 12,
  /** Extra large radius - 16px */
  XL: 16,
} as const;

/** Color palette (hex values for programmatic use) */
export const COLORS = {
  DARK: {
    /** Main app background (#0a0a0a) */
    BG: '#0a0a0a',
    /** Component containers, modals, cards (#141414) */
    SURFACE: '#141414',
    /** Component dividers and borders (#2a2a2a) */
    BORDER: '#2a2a2a',
    TEXT: {
      /** Main readable text (#e5e5e5) */
      PRIMARY: '#e5e5e5',
      /** Labels, section headers (#a3a3a3) */
      SECONDARY: '#a3a3a3',
      /** Disabled, placeholder, subtle text (#666666) */
      MUTED: '#666666',
    },
    ACCENT: {
      /** Primary accent - Blue (#3b82f6) - for primary actions, links, focus states */
      PRIMARY: '#3b82f6',
      /** Secondary accent - Purple (#8b5cf6) - for alternative accent */
      SECONDARY: '#8b5cf6',
      /** Success - Green (#10b981) - for positive actions */
      SUCCESS: '#10b981',
      /** Warning - Orange (#f59e0b) - for warning states */
      WARNING: '#f59e0b',
      /** Danger - Red (#ef4444) - for destructive actions */
      DANGER: '#ef4444',
    }
  }
} as const;

/** Predefined tag colors (for TaskTag component) */
export const TAG_COLORS = [
  { name: 'Red', value: COLORS.DARK.ACCENT.DANGER },
  { name: 'Orange', value: COLORS.DARK.ACCENT.WARNING },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: COLORS.DARK.ACCENT.SUCCESS },
  { name: 'Blue', value: COLORS.DARK.ACCENT.PRIMARY },
  { name: 'Purple', value: COLORS.DARK.ACCENT.SECONDARY },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#6b7280' },
] as const;

/** Breakpoints (for responsive logic in JS) */
export const BREAKPOINTS = {
  /** Small devices - 640px */
  SM: 640,
  /** Medium devices - 768px */
  MD: 768,
  /** Large devices - 1024px */
  LG: 1024,
  /** Extra large devices - 1280px */
  XL: 1280,
} as const;
