import { LinkedItemType } from '../types/task';

export function detectDocType(url?: string, source?: string): LinkedItemType {
  if (!url && !source) return 'other';

  // Check URL patterns
  if (url) {
    if (url.includes('docs.google.com/document')) return 'google-docs';
    if (url.includes('docs.google.com/presentation')) return 'google-slides';
    if (url.includes('docs.google.com/spreadsheets')) return 'google-sheets';
    if (url.includes('calendar.google.com')) return 'google-calendar';
    if (url.includes('mail.google.com')) return 'gmail';
    if (url.includes('atlassian.net/wiki') || url.includes('confluence')) return 'confluence';
    if (url.includes('atlassian.net/browse') || url.includes('jira')) return 'jira';
    if (url.includes('slack.com')) return 'slack';
    if (url.includes('figma.com')) return 'figma';
    if (url.includes('amplitude')) return 'amplitude';
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
          <svg className="w-4 h-4" viewBox="-.02238712 .04 256.07238712 245.94" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="confluence-gradient-a">
                <stop offset="0" stopColor="#0052cc"/>
                <stop offset=".92" stopColor="#2380fb"/>
                <stop offset="1" stopColor="#2684ff"/>
              </linearGradient>
              <linearGradient id="confluence-gradient-b" gradientUnits="userSpaceOnUse" x1="243.35" x2="83.149" xlinkHref="#confluence-gradient-a" y1="261.618" y2="169.549"/>
              <linearGradient id="confluence-gradient-c" gradientUnits="userSpaceOnUse" x1="12.633" x2="172.873" xlinkHref="#confluence-gradient-a" y1="-15.48" y2="76.589"/>
            </defs>
            <path d="m9.11 187.79c-2.64 4.3-5.63 9.34-7.99 13.33-.52.89-.85 1.88-1 2.9a8.13 8.13 0 0 0 .16 3.07c.24 1.01.68 1.95 1.28 2.79s1.36 1.56 2.23 2.12l53.03 32.69c.91.57 1.94.95 3.01 1.12 1.06.17 2.16.13 3.21-.13s2.04-.72 2.91-1.36 1.6-1.45 2.15-2.38c2.14-3.56 4.85-8.17 7.76-13.09 21.02-34.47 42.32-30.25 80.37-12.16l52.6 24.94a8.13 8.13 0 0 0 6.35.29c1.02-.38 1.96-.96 2.75-1.71.8-.75 1.43-1.65 1.87-2.65l25.25-56.93c.43-.96.67-1.99.7-3.04.04-1.04-.13-2.09-.49-3.07s-.9-1.89-1.6-2.67-1.54-1.41-2.49-1.88c-11.09-5.22-33.16-15.49-52.94-25.17-71.95-34.71-132.66-32.42-179.12 42.99z" fill="url(#confluence-gradient-b)"/>
            <path d="m246.88 58.38c2.67-4.3 5.66-9.33 7.99-13.32.53-.91.88-1.92 1.03-2.97.15-1.04.09-2.11-.17-3.13a8.155 8.155 0 0 0 -1.36-2.83 8.09 8.09 0 0 0 -2.33-2.11l-52.95-32.69c-.92-.57-1.94-.95-3.01-1.12s-2.16-.12-3.21.13c-1.05.26-2.04.72-2.91 1.36s-1.6 1.45-2.16 2.38c-2.09 3.56-4.85 8.17-7.76 13.09-21.1 34.63-42.2 30.41-80.29 12.32l-52.55-24.95c-.98-.47-2.04-.75-3.12-.81-1.08-.07-2.17.09-3.19.45s-1.96.92-2.76 1.65c-.81.73-1.45 1.61-1.91 2.59l-25.25 57.09a8.191 8.191 0 0 0 -.23 6.13c.36.99.91 1.9 1.61 2.68s1.55 1.42 2.5 1.88c11.13 5.23 33.2 15.49 52.94 25.18 71.76 34.7 132.66 32.42 179.09-43z" fill="url(#confluence-gradient-c)"/>
          </svg>
        ),
        color: '#0052CC'
      };
    case 'jira':
      return {
        icon: (
          <svg className="w-4 h-4" preserveAspectRatio="xMidYMid" viewBox="0 -30.632388516510233 255.324 285.95638851651023" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="jira-gradient-a">
                <stop offset=".18" stopColor="#0052cc"/>
                <stop offset="1" stopColor="#2684ff"/>
              </linearGradient>
              <linearGradient id="jira-gradient-b" x1="98.031%" x2="58.888%" xlinkHref="#jira-gradient-a" y1=".161%" y2="40.766%"/>
              <linearGradient id="jira-gradient-c" x1="100.665%" x2="55.402%" xlinkHref="#jira-gradient-a" y1=".455%" y2="44.727%"/>
            </defs>
            <path d="M244.658 0H121.707a55.502 55.502 0 0 0 55.502 55.502h22.649V77.37c.02 30.625 24.841 55.447 55.466 55.467V10.666C255.324 4.777 250.55 0 244.658 0z" fill="#2684ff"/>
            <path d="M183.822 61.262H60.872c.019 30.625 24.84 55.447 55.466 55.467h22.649v21.938c.039 30.625 24.877 55.43 55.502 55.43V71.93c0-5.891-4.776-10.667-10.667-10.667z" fill="url(#jira-gradient-b)"/>
            <path d="M122.951 122.489H0c0 30.653 24.85 55.502 55.502 55.502h22.72v21.867c.02 30.597 24.798 55.408 55.396 55.466V133.156c0-5.891-4.776-10.667-10.667-10.667z" fill="url(#jira-gradient-c)"/>
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
          <svg className="w-4 h-4" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Main green document */}
            <rect x="0" y="0" width="512" height="512" fill="#0F9D58" rx="50"/>
            {/* Folded corner - light green */}
            <path d="M312 0 L512 200 L512 0 Z" fill="#8ED1B1"/>
            {/* Darker fold shadow */}
            <path d="M312 0 L312 200 L512 200 Z" fill="#5BB974"/>
            {/* White spreadsheet area */}
            <rect x="130" y="335" width="242" height="220" fill="white"/>
            {/* Grid cells - 3 rows x 2 columns */}
            {/* Row 1 */}
            <rect x="160" y="365" width="75" height="40" fill="#0F9D58"/>
            <rect x="265" y="365" width="75" height="40" fill="#0F9D58"/>
            {/* Row 2 */}
            <rect x="160" y="425" width="75" height="40" fill="#0F9D58"/>
            <rect x="265" y="425" width="75" height="40" fill="#0F9D58"/>
            {/* Row 3 */}
            <rect x="160" y="485" width="75" height="40" fill="#0F9D58"/>
            <rect x="265" y="485" width="75" height="40" fill="#0F9D58"/>
          </svg>
        ),
        color: '#0F9D58'
      };
    case 'google-calendar':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Blue header */}
            <rect x="0" y="0" width="512" height="120" fill="#4285F4" rx="40"/>
            {/* White main area */}
            <rect x="0" y="120" width="382" height="352" fill="white"/>
            {/* Yellow right stripe */}
            <rect x="382" y="120" width="130" height="272" fill="#FBBC04"/>
            {/* Green bottom */}
            <rect x="0" y="392" width="382" height="80" fill="#34A853" rx="0"/>
            {/* Red folded corner */}
            <path d="M382 392 L512 392 L512 512 Z" fill="#EA4335"/>
            {/* Green bottom corner under red fold */}
            <path d="M382 392 L382 472 L462 392 Z" fill="#34A853"/>
            {/* Calendar text "31" */}
            <text x="100" y="320" fontFamily="Arial, sans-serif" fontSize="180" fontWeight="bold" fill="#4285F4">31</text>
          </svg>
        ),
        color: '#4285F4'
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
    case 'figma':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 200 300" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 300c27.6 0 50-22.4 50-50v-50H50c-27.6 0-50 22.4-50 50s22.4 50 50 50z" fill="#0ACF83"/>
            <path d="M0 150c0-27.6 22.4-50 50-50h50v100H50c-27.6 0-50-22.4-50-50z" fill="#A259FF"/>
            <path d="M0 50C0 22.4 22.4 0 50 0h50v100H50C22.4 100 0 77.6 0 50z" fill="#F24E1E"/>
            <path d="M100 0h50c27.6 0 50 22.4 50 50s-22.4 50-50 50h-50V0z" fill="#FF7262"/>
            <path d="M200 150c0 27.6-22.4 50-50 50s-50-22.4-50-50 22.4-50 50-50 50 22.4 50 50z" fill="#1ABCFE"/>
          </svg>
        ),
        color: '#F24E1E'
      };
    case 'gmail':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 256 193" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M58.182 192.05V93.493L27.507 65.127 0 49.163v132.13c0 6.541 5.316 11.856 11.857 11.856h46.325z" fill="#4285F4"/>
            <path d="M197.818 192.05h46.325c6.541 0 11.857-5.316 11.857-11.856V49.163l-27.507 15.964-30.675 28.366v98.557z" fill="#34A853"/>
            <path d="M197.818 17.504v75.989L256 49.163V26.647c0-21.864-24.896-34.368-42.349-21.284l-15.833 12.141z" fill="#FBBC04"/>
            <path d="M0 49.163l58.182 44.33V17.504L42.349 5.363C24.896-7.721 0 4.783 0 26.647v22.516z" fill="#EA4335"/>
            <path d="M58.182 93.493l0-75.989 69.818 53.653 69.818-53.653v75.989l-69.818 53.653z" fill="#C5221F"/>
          </svg>
        ),
        color: '#EA4335'
      };
    case 'amplitude':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="100" fill="#1F5FFF"/>
            <path d="M75 145L75 115L90 75L105 115L120 55L135 95L150 75"
                  stroke="white"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"/>
          </svg>
        ),
        color: '#1F5FFF'
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
    case 'google-calendar':
      return 'Google Calendar';
    case 'gmail':
      return 'Gmail';
    case 'obsidian':
      return 'Obsidian';
    case 'slack':
      return 'Slack';
    case 'figma':
      return 'Figma';
    case 'amplitude':
      return 'Amplitude';
    default:
      return 'Link';
  }
}
