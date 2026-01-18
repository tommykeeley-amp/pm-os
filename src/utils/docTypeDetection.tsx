import { LinkedItemType } from '../types/task';

export function detectDocType(url?: string, source?: string): LinkedItemType {
  if (!url && !source) return 'other';

  // Check URL patterns
  if (url) {
    if (url.includes('docs.google.com/document')) return 'google-docs';
    if (url.includes('docs.google.com/presentation')) return 'google-slides';
    if (url.includes('docs.google.com/spreadsheets')) return 'google-sheets';
    if (url.includes('atlassian.net/wiki') || url.includes('confluence')) return 'confluence';
    if (url.includes('atlassian.net/browse') || url.includes('jira')) return 'jira';
    if (url.includes('slack.com')) return 'slack';
  }

  // Check source field
  if (source === 'obsidian') return 'obsidian';
  if (source === 'confluence') return 'confluence';
  if (source === 'jira') return 'jira';

  return 'other';
}

export function getDocTypeIcon(type: LinkedItemType): { icon: JSX.Element; color: string } {
  switch (type) {
    case 'confluence':
      return {
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 225 225">
            <path d="M 43 16 L 15 66 L 16 73 L 74 107 L 55 117 L 37 134 L 14 174 L 16 182 L 60 207 L 70 210 L 76 206 L 91 178 L 99 172 L 104 172 L 173 210 L 181 208 L 209 158 L 208 151 L 150 117 L 173 104 L 187 90 L 210 50 L 208 42 L 164 17 L 154 14 L 148 18 L 133 46 L 125 52 L 120 52 L 51 14 Z M 36 170 L 38 168 L 48 149 L 62 134 L 75 126 L 77 126 L 83 123 L 90 122 L 91 121 L 112 121 L 113 122 L 123 124 L 134 129 L 136 131 L 143 134 L 145 136 L 163 145 L 165 147 L 172 150 L 174 152 L 181 155 L 187 159 L 187 162 L 185 164 L 182 171 L 180 173 L 177 180 L 175 182 L 172 188 L 169 188 L 167 186 L 149 177 L 147 175 L 120 161 L 118 159 L 108 155 L 95 155 L 85 159 L 77 167 L 67 186 L 65 188 L 62 188 L 60 186 L 36 173 Z M 37 65 L 37 62 L 39 60 L 42 53 L 44 51 L 47 44 L 49 42 L 52 36 L 55 36 L 57 38 L 75 47 L 77 49 L 104 63 L 106 65 L 116 69 L 129 69 L 130 68 L 135 67 L 140 64 L 147 57 L 157 38 L 159 36 L 162 36 L 164 38 L 171 41 L 173 43 L 180 46 L 182 48 L 188 51 L 188 54 L 186 56 L 176 75 L 162 90 L 149 98 L 147 98 L 141 101 L 134 102 L 133 103 L 112 103 L 111 102 L 107 102 L 106 101 L 101 100 L 90 95 L 88 93 L 81 90 L 79 88 L 72 85 L 70 83 L 63 80 L 61 78 L 52 74 L 50 72 L 43 69 Z" fillRule="evenodd" />
          </svg>
        ),
        color: '#0052CC'
      };
    case 'jira':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 256 256">
            <path d="M 150 28 H 220 V 98 C 220 122 198 122 186 110 L 150 74 C 138 62 138 28 150 28 Z"/>
            <path d="M 86 84 H 156 V 154 C 156 178 134 178 122 166 L 86 130 C 74 118 74 84 86 84 Z"/>
            <path d="M 28 142 H 98 V 212 C 98 236 76 236 64 224 L 28 188 C 16 176 16 142 28 142 Z"/>
          </svg>
        ),
        color: '#0052CC'
      };
    case 'google-docs':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="192" height="192" fill="none"/>
            <path d="M116 8L160 52H138L116 52V8Z" fill="#1E88E5"/>
            <path d="M116 52V8H44C37.37 8 32 13.37 32 20V172C32 178.63 37.37 184 44 184H148C154.63 184 160 178.63 160 172V52H116Z" fill="#1976D2"/>
            <rect x="56" y="76" width="80" height="8" fill="white"/>
            <rect x="56" y="96" width="80" height="8" fill="white"/>
            <rect x="56" y="116" width="50" height="8" fill="white"/>
          </svg>
        ),
        color: '#4285F4'
      };
    case 'google-slides':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect fill="none" height="192" width="192"/>
            <polygon fill="#F29900" points="116,8 160,52 138,56 116,52 112,32"/>
            <path d="M116,52V8H44c-6.63,0-12,5.37-12,12v152c0,6.63,5.37,12,12,12h104c6.63,0,12-5.37,12-12V52H116z" fill="#FBBC04"/>
            <path d="M56,76v54h80V76H56z M126,120H66V86h60V120z" fill="#FFFFFF"/>
          </svg>
        ),
        color: '#F4B400'
      };
    case 'google-sheets':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect fill="none" height="192" width="192"/>
            <path d="M116 8L160 52H138L116 52V8Z" fill="#0F9D58"/>
            <path d="M116 52V8H44C37.37 8 32 13.37 32 20V172C32 178.63 37.37 184 44 184H148C154.63 184 160 178.63 160 172V52H116Z" fill="#0F9D58"/>
            <rect x="56" y="76" width="80" height="54" fill="white"/>
            <path d="M56 98H136M96 76V130" stroke="#0F9D58" strokeWidth="2"/>
          </svg>
        ),
        color: '#34A853'
      };
    case 'obsidian':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="obsidian-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#B8A4E8', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#8B7ED8', stopOpacity: 1 }} />
              </linearGradient>
              <linearGradient id="obsidian-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#8B7ED8', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#7C3AED', stopOpacity: 1 }} />
              </linearGradient>
              <linearGradient id="obsidian-grad-3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#7C3AED', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#6C4BB4', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
            <path d="M220 50 L140 180 L180 320 L280 450 L380 320 L420 180 L340 50 Z" fill="url(#obsidian-grad-1)" />
            <path d="M180 320 L280 450 L380 320 L300 240 Z" fill="url(#obsidian-grad-2)" />
            <path d="M140 180 L220 50 L340 50 L300 150 Z" fill="url(#obsidian-grad-3)" />
            <path d="M340 50 L420 180 L380 320 L300 240 Z" fill="url(#obsidian-grad-2)" opacity="0.8" />
          </svg>
        ),
        color: '#7C3AED'
      };
    case 'slack':
      return {
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        ),
        color: '#4A154B'
      };
    default:
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        ),
        color: '#666666'
      };
  }
}

export function getDocTypeLabel(type: LinkedItemType): string {
  switch (type) {
    case 'confluence':
      return 'Confluence';
    case 'jira':
      return 'Jira';
    case 'google-docs':
      return 'Google Docs';
    case 'google-slides':
      return 'Google Slides';
    case 'google-sheets':
      return 'Google Sheets';
    case 'obsidian':
      return 'Obsidian';
    case 'slack':
      return 'Slack';
    default:
      return 'Link';
  }
}
