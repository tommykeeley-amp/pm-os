/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // COLOR PALETTE
      colors: {
        dark: {
          bg: '#0a0a0a',
          surface: '#141414',
          border: '#2a2a2a',
          text: {
            primary: '#e5e5e5',
            secondary: '#a3a3a3',
            muted: '#666666',
          },
          accent: {
            primary: '#3b82f6',
            secondary: '#8b5cf6',
            success: '#10b981',
            warning: '#f59e0b',
            danger: '#ef4444',
          }
        },
        // Brand color (matches app icon)
        brand: {
          yellow: '#FCD34D',
        }
      },

      // BORDER RADIUS SCALE
      borderRadius: {
        'none': '0',
        'sm': '0.25rem',   // 4px - small elements (checkboxes, small icons)
        'md': '0.5rem',    // 8px - default components (buttons, inputs)
        'lg': '0.75rem',   // 12px - cards, containers
        'xl': '1rem',      // 16px - large modals
        'full': '9999px',  // circles (color pickers, avatars)
      },

      // TYPOGRAPHY SCALE
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],      // 12px - labels, captions, badges
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],  // 14px - body text, buttons
        'base': ['1rem', { lineHeight: '1.5rem' }],     // 16px - default
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],  // 18px - modal titles
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],   // 20px - large headings
        '2xl': ['1.5rem', { lineHeight: '2rem' }],      // 24px - page titles
      },

      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },

      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      // SHADOW SCALE (for depth)
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        'dropdown': '0 8px 16px rgba(0, 0, 0, 0.5)',
      },

      // TRANSITION DURATIONS
      transitionDuration: {
        'fast': '100ms',    // Quick hover effects
        'normal': '150ms',  // Default transitions
        'slow': '300ms',    // Complex animations
      },

      // Z-INDEX SCALE
      zIndex: {
        'base': 0,
        'dropdown': 10,
        'modal': 50,
        'toast': 100,
      },

      // ANIMATIONS
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },

      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': {
            opacity: '1',
            transform: 'scale(1)',
            boxShadow: '0 0 0 0 rgba(252, 211, 77, 0.9)',
          },
          '50%': {
            opacity: '0.6',
            transform: 'scale(1.3)',
            boxShadow: '0 0 12px 6px rgba(252, 211, 77, 0.6)',
          },
        },
      },
    },
  },
  plugins: [],
}
