# PM-OS Slack Bot Setup Guide

This guide will help you set up the PM-OS Slack bot so you can create tasks by @mentioning PM-OS in Slack.

## Features

- **@mention to create tasks**: Simply @mention PM-OS in Slack and say "make a task for [description]" or "create a task: [title]"
- **Automatic linking**: Tasks created from Slack automatically include a link back to the Slack message
- **Confirmation replies**: PM-OS replies in the thread to confirm the task was created

## Prerequisites

1. You need admin access to your Slack workspace to create a bot
2. PM-OS must be running on your machine
3. You'll need to expose PM-OS's webhook endpoint (port 3001) to the internet

## Setup Steps

### 1. Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Name it "PM-OS" and select your workspace
5. Click "Create App"

### 2. Configure Bot Scopes

1. In your app settings, go to "OAuth & Permissions"
2. Scroll to "Bot Token Scopes"
3. Add these scopes:
   - `app_mentions:read` - To receive @mentions
   - `chat:write` - To send confirmation messages
   - `channels:read` - To read channel info
   - `channels:history` - To read channel messages
   - `groups:history` - To read private channel messages
   - `im:history` - To read DMs
   - `mpim:history` - To read group DMs
   - `users:read` - To get user information

### 3. Enable Event Subscriptions

1. In your app settings, go to "Event Subscriptions"
2. Turn on "Enable Events"
3. For "Request URL", you'll need to expose PM-OS's webhook endpoint:

   **Option A: Using ngrok (recommended for testing)**
   ```bash
   # Install ngrok if you haven't already
   brew install ngrok

   # Expose port 3001
   ngrok http 3001
   ```

   Copy the HTTPS URL ngrok provides (e.g., `https://abc123.ngrok.io`) and use:
   ```
   https://abc123.ngrok.io/slack/events
   ```

   **Option B: For production**
   - Set up a permanent public URL that forwards to your machine's port 3001
   - Use that URL followed by `/slack/events`

4. Once Slack verifies the URL, scroll to "Subscribe to bot events"
5. Add the event: `app_mention`
6. Click "Save Changes"

### 4. Install the App to Your Workspace

1. In your app settings, go to "OAuth & Permissions"
2. Click "Install to Workspace"
3. Review and authorize the permissions
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 5. Connect PM-OS to Slack

1. Open PM-OS
2. Go to Settings → Integrations
3. Click "Connect" next to Slack
4. Complete the OAuth flow
5. PM-OS will automatically store your bot token

### 6. Test It Out!

1. In any Slack channel where the PM-OS bot has been added, type:
   ```
   @PM-OS make a task for reviewing the quarterly results
   ```

2. PM-OS will:
   - Create a task with the title "reviewing the quarterly results"
   - Add a link to the Slack message in the task's linked items
   - Reply in the thread confirming the task was created

## Usage Examples

Here are some ways to create tasks:

```
@PM-OS make a task for following up with the design team
@PM-OS create a task: Schedule 1:1 with Sarah
@PM-OS add a task for preparing the presentation
```

## Troubleshooting

### "PM-OS isn't responding"
- Make sure PM-OS is running on your machine
- Check that the ngrok tunnel is active (if using ngrok)
- Verify the webhook URL in Slack's Event Subscriptions matches your ngrok URL

### "Task not appearing"
- Check PM-OS console logs for errors
- Make sure you're using the right command format
- Try refreshing the PM-OS window

### "Permission denied errors"
- Make sure you've added all the required bot scopes
- Reinstall the app to your workspace to update permissions

## Advanced: Production Setup

For a permanent setup without ngrok:

1. Set up a reverse proxy (nginx, Caddy, etc.) on a server
2. Forward requests to your machine's port 3001
3. Use a custom domain or static IP
4. Update the Slack Event Subscriptions URL to use your permanent endpoint

## Security Notes

- The bot token is stored securely in your system keychain
- PM-OS only processes app_mention events
- No Slack data is sent to external servers
- All processing happens locally on your machine
