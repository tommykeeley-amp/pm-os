# Setup Instructions for Will

## Step 1: Install PM-OS

### Option A: Fresh Install (Recommended)
1. Get the latest DMG from Tommy:
   - `PM-OS-0.1.0-arm64.dmg` from the `release/` folder

2. Double-click the DMG file

3. Drag PM-OS to your Applications folder

4. Open PM-OS from Applications
   - **If you see "PM-OS cannot be opened":**
     - Right-click PM-OS → Open
     - Click "Open" in the security dialog

### Option B: Copy .env File (If app already installed)
If you already have PM-OS installed, make sure you have the OAuth credentials:

1. Get the `.env` file from Tommy (in the `pm-os` folder)
2. Copy it to PM-OS app data:
   ```bash
   mkdir -p ~/Library/Application\ Support/pm-os
   cp /path/to/.env ~/Library/Application\ Support/pm-os/.env
   ```
3. Restart PM-OS

---

## Step 2: Configure Your Settings

### A. Personal Info (CRITICAL)
1. Open PM-OS Settings (⚙️ gear icon)
2. **Personal** tab
3. Enter YOUR details:
   - **Email:** `will@amplitude.com` (must match your Slack email!)
   - **Name:** Your name

**Why this matters:** Your email routes Slack tasks to YOUR PM-OS instance (not Tommy's)

### B. Jira Credentials
1. **Integrations** tab
2. Find **Atlassian** → Toggle ON
3. Enter YOUR Jira credentials:
   - **Jira Domain:** `amplitude.atlassian.net`
   - **Jira Email:** `will@amplitude.com` (your email)
   - **Jira API Token:** Create one at https://id.atlassian.com/manage-profile/security/api-tokens
     - Click "Create API token"
     - Name it "PM-OS"
     - Copy and paste it here
   - **Default Project:** `AMP` (or your default project)
   - **Default Issue Type:** `Task`

4. Click **"Test Connection"** to verify it works

---

## Step 3: Connect Slack

1. **Integrations** tab
2. Find **Slack** → Click **"Connect"**

### Expected Behavior:
- ✅ Browser opens to Slack authorization page
- ✅ Click "Allow" to authorize
- ✅ Browser redirects and PM-OS shows "Connected"

### If Nothing Happens:
1. Open DevTools: `Cmd+Option+I`
2. Go to **Console** tab
3. Click "Connect" again
4. **Screenshot any errors** and send to Tommy

### If You See an Error Message:
- Red banner will show what went wrong
- Screenshot it and send to Tommy
- Common issues:
  - Missing OAuth credentials
  - Browser permissions
  - Firewall blocking

---

## Step 4: Test It Works

### Test Slack Integration:
1. In any Slack channel, type:
   ```
   @PM-OS create a jira ticket: Test from Will
   ```

2. **Expected Result:**
   - PM-OS picks up the task (check logs: `tail -f ~/pm-os-jira-debug.log`)
   - Modal appears with ticket details
   - Ticket is created with **YOU as the reporter** (not Tommy!)

### Check the Logs:
```bash
# See if your PM-OS is picking up the task
tail -f ~/pm-os-jira-debug.log | grep -i "will@amplitude.com"

# Should show:
# [SlackEvents] Task abc123 is for me (will@amplitude.com)
# [Jira] Searching for reporter by email: will@amplitude.com
```

---

## Troubleshooting

### Can't Connect Slack?
Run diagnostics:
```bash
# Check if OAuth credentials are available
cat ~/Library/Application\ Support/pm-os/.env | grep SLACK_CLIENT_ID

# Check OAuth logs
tail -20 /tmp/pm-os-oauth-debug.log
```

Send output to Tommy.

### Jira Tickets Show Wrong Reporter?
1. Verify your email is set in Settings → Personal → Email
2. Check it matches your Slack account email exactly
3. Check logs to see task routing:
   ```bash
   tail -f ~/pm-os-jira-debug.log
   ```

### PM-OS Not Picking Up Your Tasks?
1. Make sure your email in Settings matches your Slack email
2. Check if Tommy's PM-OS is picking them up instead
3. **Both of you** should set your emails in Settings

---

## Need Help?

Send Tommy:
1. Screenshot of Settings → Personal tab (with your email)
2. Screenshot of Settings → Integrations tab (showing Slack/Jira status)
3. Console output from DevTools (Cmd+Option+I)
4. Logs:
   ```bash
   tail -50 ~/pm-os-jira-debug.log
   tail -50 /tmp/pm-os-oauth-debug.log
   ```
