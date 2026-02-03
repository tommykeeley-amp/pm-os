# OAuth Connection & Task Routing Fixes - Complete

## Summary

I've implemented comprehensive fixes for both issues:
1. **Slack OAuth connection debugging** - Added detailed logging throughout the OAuth flow
2. **Task routing** - Added user identification to ensure each PM-OS instance processes only their own tasks

## Changes Made

### 1. Vercel Webhook - Task Routing
**File:** `oauth-callback/app/api/slack/events/route.ts`

**What changed:**
- When a user mentions @PM-OS in Slack, the webhook now fetches that user's Slack email
- Added `reporterEmail` and `reporterName` to the task data
- These fields are used by PM-OS instances to filter which tasks they process

**Why this matters:**
- Will's PM-OS will only process tasks created by Will
- Tommy's PM-OS will only process tasks created by Tommy
- Jira tickets will show the correct reporter (the person who created the task)

**Code added:**
```typescript
// Fetch requester info
const requesterInfo = await fetchSlackUserInfo(event.user);
if (requesterInfo && requesterInfo.email) {
  reporterName = requesterInfo.name;
  reporterEmail = requesterInfo.email;
}

// Add to task data
const taskData = {
  // ... other fields
  reporterEmail,
  reporterName,
};
```

### 2. OAuth Flow Logging - Main Process
**File:** `electron/main.ts`

**What changed:**
- Enhanced `start-oauth` handler with step-by-step logging
- Enhanced protocol handler (`handleProtocolUrl`) with detailed progress tracking
- All logs include timestamps, success/failure indicators, and error details
- Logs written to `/tmp/pm-os-oauth-debug.log`

**Log sections:**
```
========================================
[OAuth] START - <timestamp>
[OAuth] Provider: slack
[OAuth] Step 1: Checking environment variables...
[OAuth] ✓ OAUTH_REDIRECT_URI found: https://pm-os.vercel.app/oauth-callback
[OAuth] ✓ SLACK_CLIENT_ID found: 2359418194103...
[OAuth] Step 2: Building authorization URL...
[OAuth] ✓ Authorization URL built (length: 450 chars)
[OAuth] Step 3: Opening system browser...
[OAuth] ✓ Browser opened successfully (took 125ms)
[OAuth] END - Success
========================================
```

**Protocol handler logs:**
```
========================================
[Protocol] CALLBACK RECEIVED - <timestamp>
[Protocol] Full URL: pmos://callback?provider=slack&sessionId=...
[Protocol] Step 1: Parsing callback URL...
[Protocol] ✓ URL parsed successfully
[Protocol] Step 2: Exchanging session ID for tokens...
[Protocol] ✓ Tokens received from Vercel
[Protocol] Step 3: Saving tokens to electron-store...
[Protocol] ✓ Slack tokens saved successfully
[Protocol] Step 4: Initializing Slack integration...
[Protocol] ✓ Slack integration initialized
[Protocol] ✓✓✓ Slack connection SUCCESSFUL (took 847ms)
[Protocol] END - Success
========================================
```

### 3. OAuth Flow Logging - Renderer Process
**File:** `src/components/Settings.tsx`

**What changed:**
- Enhanced `handleConnect` with detailed logging
- Added `handleOAuthError` event handler
- Logs show user actions, IPC communication, and results

**Example logs:**
```
========== [Settings] OAuth Connect Clicked ==========
[Settings] Time: 2026-02-03T19:45:12.345Z
[Settings] Provider: slack
[Settings] User action: Clicked "Connect" button
[Settings] Step 1: Calling window.electronAPI.startOAuthFlow('slack')
[Settings] Step 2: Received result from main process: { success: true }
[Settings] ✓ OAuth flow initiated successfully
[Settings] Waiting for browser authorization...
========== [Settings] OAuth Connect Handler Done ==========
```

### 4. IPC Communication
**File:** `electron/preload.ts`

**What changed:**
- Added `onOAuthError` handler to preload bridge
- Added TypeScript type definitions

**Code added:**
```typescript
onOAuthError: (callback: (data: { error: string }) => void) => {
  ipcRenderer.on('oauth-error', (_event, data) => callback(data));
  return () => ipcRenderer.removeAllListeners('oauth-error');
},
```

## Testing the OAuth Connection

### For Will to test:

1. **Open PM-OS**
   - Make sure it's the newly built version from `release/PM-OS-0.1.0-arm64.dmg`

2. **Open DevTools**
   - Press `Cmd+Option+I`
   - Go to Console tab

3. **Try connecting Slack**
   - Go to Settings → Integrations
   - Click "Connect" for Slack
   - Watch the Console output

4. **Check the OAuth log file**
   ```bash
   tail -f /tmp/pm-os-oauth-debug.log
   ```

### What you should see:

**If everything works:**
- Console shows "OAuth flow initiated successfully"
- Browser opens to Slack authorization page
- After clicking "Allow", PM-OS shows "Connected"
- Log file shows "✓✓✓ Slack connection SUCCESSFUL"

**If something fails:**
- Detailed error messages in Console
- Red error banner in Settings
- Log file shows exactly where it failed with error details

## Vercel Deployment

The Vercel webhook changes need to be deployed:

1. **Check auto-deployment:**
   - Vercel should auto-deploy when you pushed to `main`
   - Check https://vercel.com/dashboard to see deployment status

2. **If auto-deploy didn't trigger:**
   ```bash
   cd oauth-callback
   vercel deploy --prod
   ```

## Testing Task Routing

Once both Will and Tommy have:
1. Updated PM-OS app
2. Set their email in Settings → Personal → Email

**Test:**
1. Will mentions @PM-OS in Slack: "create a jira ticket: Test from Will"
2. Will's PM-OS should pick it up (check logs)
3. Tommy's PM-OS should ignore it (check logs)
4. Jira ticket should show Will as reporter

**Check logs:**
```bash
# Will's machine
tail -f ~/pm-os-jira-debug.log

# Should see:
[SlackEvents] Task abc123 is for me (will@amplitude.com)
[Jira] Searching for reporter by email: will@amplitude.com
```

```bash
# Tommy's machine
tail -f ~/pm-os-jira-debug.log

# Should see:
[SlackEvents] Task abc123 is NOT for me (requester: will@amplitude.com, me: tommy@amplitude.com)
```

## Files Changed

- `oauth-callback/app/api/slack/events/route.ts` - Added reporter fields to task data
- `electron/main.ts` - Enhanced OAuth logging in main process
- `electron/preload.ts` - Added OAuth error handler
- `src/components/Settings.tsx` - Enhanced OAuth logging in renderer
- `electron/slack-events.ts` - Task filtering by user email (already done in previous commit)

## Commit

Pushed to GitHub: `e5a345e`
Branch: `main`

## Next Steps

1. **Deploy Vercel** (check auto-deploy or run `vercel deploy --prod`)
2. **Distribute new PM-OS build to Will** - `release/PM-OS-0.1.0-arm64.dmg`
3. **Will: Install and set email in Settings**
4. **Will: Try connecting Slack and send logs** (`/tmp/pm-os-oauth-debug.log`)
5. **Test task routing** - Create tickets from both Will and Tommy's Slack

## How to Get Logs for Debugging

If Will still can't connect Slack:

1. **OAuth logs:**
   ```bash
   cat /tmp/pm-os-oauth-debug.log
   ```

2. **Task routing logs:**
   ```bash
   cat ~/pm-os-jira-debug.log
   ```

3. **Console logs:**
   - Open DevTools (`Cmd+Option+I`)
   - Click "Connect" for Slack
   - Screenshot the Console output

Send all three to Tommy for debugging.

---

## Summary

✅ **OAuth logging** - Complete, comprehensive logging throughout the flow
✅ **Task routing** - Reporter email/name added to task data
✅ **Error handling** - Error events propagated to UI with clear messages
✅ **Built and committed** - Ready for deployment and testing

🚀 **Next:** Deploy Vercel, distribute app to Will, test OAuth connection
