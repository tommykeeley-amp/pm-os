# PM-OS (Product Manager Operating System)

A smart, dark mode task management widget that floats on your macOS desktop and intelligently surfaces tasks from your calendar, email, and Slack.

## Features

- Dark mode floating widget that can be summoned with a global hotkey
- Pin to the right side of your Mac screen
- Smart context-aware task suggestions based on:
  - Google Calendar events
  - Gmail unread/starred emails
  - Slack mentions and DMs
- Manual task management with quick add input
- Persistent task storage
- Beautiful, minimal UI with smooth animations

## Quick Start (Without Integrations)

Want to try PM-OS without setting up OAuth? You can use it as a standalone task manager:

```bash
# Install dependencies
npm install

# Run the app
npm run dev
```

Press `Cmd+Shift+Space` to open the widget and start adding tasks!

## Full Setup (With Integrations)

### Prerequisites

- Node.js 18+ and npm
- macOS (primary target)
- Google account (for Calendar + Gmail)
- Slack workspace (for Slack integration)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your OAuth credentials to .env (see API Setup section below)
```

### Plugin Setup (Recommended)

PM-OS uses Claude Code plugins to enhance Strategize capabilities with document creation and analytics:

```bash
# Run the automated setup script
./setup-plugins.sh
```

This installs:
- **Document Skills**: Create Word, PDF, PowerPoint, and Excel files
- **Amplitude Analysis**: Advanced product analytics capabilities

See [PLUGINS.md](./PLUGINS.md) for detailed documentation.

### Development

```bash
# Run the app in development mode
npm run dev
```

The app will open in a floating window on the right side of your screen.

### Global Hotkey

The default hotkey is `Cmd+Shift+Space`. Press it to show/hide the widget.

## API Setup (for integrations)

To enable Google Calendar, Gmail, and Slack integrations, you'll need to set up OAuth credentials:

### Google (Calendar + Gmail)

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create a new project**
   - Click "Select a project" → "New Project"
   - Name it "PM-OS" and click Create
3. **Enable APIs**
   - Go to "APIs & Services" → "Library"
   - Search for and enable "Google Calendar API"
   - Search for and enable "Gmail API"
4. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Select "External" (unless you have a Google Workspace)
   - Fill in App name, User support email, and Developer contact
   - Add scopes: `calendar.readonly` and `gmail.readonly`
   - Add your email as a test user
5. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Desktop app"
   - Add Authorized redirect URI: `http://localhost:3000/oauth/callback`
   - Save the Client ID and Client Secret

### Slack

1. **Go to [Slack API](https://api.slack.com/apps)**
2. **Create a new app**
   - Click "Create New App" → "From scratch"
   - Name it "PM-OS" and select your workspace
3. **Configure OAuth & Permissions**
   - Go to "OAuth & Permissions"
   - Add Redirect URL: `http://localhost:3000/oauth/callback`
   - Scroll to "Scopes" and add Bot Token Scopes:
     - `channels:read`
     - `chat:write`
     - `users:read`
     - `im:read`
     - `im:history`
     - `search:read`
     - `stars:read`
4. **Install to Workspace**
   - Click "Install to Workspace" button
   - Save the Bot User OAuth Token (starts with `xoxb-`)
5. **Get Client ID and Secret**
   - Go to "Basic Information"
   - Copy "Client ID" and "Client Secret" from the App Credentials section

### Jira/Atlassian

1. **Create an Atlassian OAuth app** at [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps)
2. **Configure OAuth callback URL**
   - Add `http://localhost:3000/oauth/callback` for local development
   - Add your deployed callback URL (for this repo it is typically `https://pm-os.vercel.app/oauth-callback`)
3. **Set OAuth credentials**
   - `ATLASSIAN_CLIENT_ID`
   - `ATLASSIAN_CLIENT_SECRET`
4. **Find your Jira domain**
   - Your Jira domain is usually: `yourcompany.atlassian.net`
   - Example: If you access Jira at `https://acme.atlassian.net`, your domain is `acme.atlassian.net`
5. **Find your default project key**
   - Go to your Jira instance
   - Look at any project URL (e.g., `https://yourcompany.atlassian.net/browse/PROJ-123`)
   - The project key is the uppercase letters before the dash (e.g., `PROJ`)

Legacy fallback:
- You can still use Jira email + API token if needed, but OAuth is now the default path.

### Configuration

Create a `.env` file in the root directory (copy from `.env.example`):

```env
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
SLACK_CLIENT_ID=your_slack_client_id_here
SLACK_CLIENT_SECRET=your_slack_client_secret_here
ATLASSIAN_CLIENT_ID=your_atlassian_client_id_here
ATLASSIAN_CLIENT_SECRET=your_atlassian_client_secret_here
JIRA_DOMAIN=yourcompany.atlassian.net
JIRA_EMAIL=your_email@company.com
JIRA_API_TOKEN=your_jira_api_token_here
JIRA_DEFAULT_PROJECT=PROJ
JIRA_DEFAULT_ISSUE_TYPE=Task
OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback
OAUTH_BASE_URL=https://pm-os.vercel.app
```

**Important Notes:**
- Keep the `.env` file secure and never commit it to version control
- Google OAuth requires you to add test users during development
- Slack app needs to be installed to your workspace first
- Jira supports OAuth (recommended); API token auth is optional legacy fallback

### Local OAuth Backend Testing (Before Deploy)

If you want to test OAuth changes locally before deploying `oauth-callback`:

1. Run `oauth-callback` on a non-3000 port (Electron uses 3000 internally):
   - Example: `cd oauth-callback && npx next dev -p 3001`
2. In app `.env`, set:
   - `OAUTH_BASE_URL=http://localhost:3001`
3. In `oauth-callback` env, set:
   - `OAUTH_REDIRECT_URI=http://localhost:3001/oauth-callback`
4. In your OAuth provider app settings (Slack/Atlassian), add callback URL:
   - `http://localhost:3001/oauth-callback`
5. Restart PM-OS and run the connect flow.

## Usage

1. Press `Cmd+Shift+Space` to open the widget
2. Type a task and press Enter to add it
3. Click the link icon in the header to open integrations
4. Connect your Google, Slack, and/or Atlassian accounts
5. Smart suggestions will automatically appear based on:
   - **Calendar**: Upcoming meetings (prioritized if within 30 minutes)
   - **Gmail**: Unread, starred, or action-required emails
   - **Slack**: Mentions, DMs, and saved items
6. Click the + button on a suggestion to add it as a task
7. Click the pin icon to keep the widget on the right side of your screen
8. **Jira Integration**: Hover over any task and click the Jira icon to create a ticket
   - Select project and issue type
   - The task title becomes the ticket summary
   - Opens ticket URL in browser when created

### How Smart Suggestions Work

PM-OS uses a context-aware engine to prioritize tasks:

- **High Priority**: Meetings in the next 30 minutes, starred emails, Slack mentions
- **Medium Priority**: Today's calendar events, unread emails, Slack DMs
- **Low Priority**: Future calendar events, older messages

The engine automatically:
- Refreshes suggestions when you open the widget
- Filters out past events
- Combines multiple sources intelligently
- Limits to top 10 most important items

## Keyboard Shortcuts

- `Cmd+Shift+Space` - Toggle widget visibility
- `Enter` - Add task (when in input field)
- `Escape` - Clear input field
- Click outside - Hide widget (optional, configurable)

## Building

```bash
# Build the production app
npm run electron:build

# Build a team-safe package (excludes .env and .env.* from artifacts)
npm run electron:build:team
```

The built app will be in the `release/` directory.

## Tech Stack

- Electron - Desktop app framework
- React + TypeScript - UI
- Tailwind CSS - Styling
- Vite - Build tool
- electron-store - Persistent storage
- googleapis - Google Calendar and Gmail APIs
- @slack/web-api - Slack API client
- date-fns - Date utilities

## License

MIT
