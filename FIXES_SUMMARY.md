# Bug Fixes Summary

## Issue 1: Slack OAuth Connection - "Nothing Happens" When Clicking Connect

### Problem
When Will clicks the "Connect" button for Slack in Settings, nothing visible happens. The OAuth flow should open a browser window but fails silently.

### Root Cause
- No error handling or user feedback when OAuth flow fails
- Missing environment variable checks
- Browser open failures were not communicated to the user

### Solution
**Files Modified:**
1. `src/components/Settings.tsx`
   - Added `connectionError` state to track connection failures
   - Enhanced `handleConnect` function with better error handling and logging
   - Added helpful error messages with context (e.g., "check .env file", "check browser settings")
   - Added visual error display in UI with red banner showing error details
   - Clear error state on successful connection

2. `electron/main.ts` (IPC handler `start-oauth`)
   - Added validation for required environment variables (OAUTH_REDIRECT_URI, CLIENT_ID)
   - Added try-catch around `shell.openExternal` to catch browser opening failures
   - Return structured error response instead of throwing
   - Enhanced logging for debugging

### User Experience Improvements
- Clear error messages explaining what went wrong
- Suggestions for how to fix common issues
- Dismissible error banner in UI
- Console logging for debugging

---

## Issue 2: Jira Reporter - Tickets Created by Will Show Tommy as Reporter

### Problem
When Will creates a Jira ticket from Slack via the PM-OS bot, the ticket is created with Tommy (the API credential owner) as the reporter instead of Will.

### Root Causes
1. **Task Routing:** All running PM-OS instances poll for ALL tasks, so whoever's instance picks it up first processes it with THEIR credentials
2. **Reporter Field:** The Jira API automatically sets the authenticated user (the API token owner) as the reporter

### Solution - Part 1: User-Specific Task Routing ⚠️ **CRITICAL**
**Files Modified:**
1. `electron/slack-events.ts`
   - Added user email filtering when polling for tasks
   - Each PM-OS instance now only processes tasks where the requester's email matches the configured email
   - Added logging to show task routing decisions

2. `src/components/Settings.tsx`
   - Marked email field as required with asterisk
   - Added clear explanation that email must match Slack account
   - Emphasized importance for correct task routing

**How It Works:**
1. Will configures his email (will@amplitude.com) in PM-OS Settings → Personal tab
2. When Will mentions `@PM-OS` in Slack, the Vercel webhook captures his Slack email
3. Will's PM-OS polls Vercel and ONLY picks up tasks where `requesterEmail === will@amplitude.com`
4. Tommy's PM-OS polls Vercel and ONLY picks up tasks where `requesterEmail === tommy@amplitude.com`
5. Will's tasks use Will's Jira credentials → Will is the reporter ✅

**⚠️ IMPORTANT - Vercel Update Required:**
The Vercel webhook must extract and include the requester's email in the task data:
- Field name: `reporterEmail` or `user_email`
- Source: Slack user's email address from the Slack API
- This is needed for task routing to work correctly

### Solution - Part 2: Reporter Field Support
**Files Modified:**
1. `src/services/jira.ts`
   - Added `reporterName` and `reporterEmail` fields to `CreateIssueRequest` interface
   - Added reporter lookup logic similar to assignee lookup (search by email first, fallback to name)
   - Set `reporter` field in Jira issue payload when creating tickets
   - Added logging to track reporter resolution

2. `electron/slack-events.ts`
   - Added `reporterName` and `reporterEmail` to handler interface
   - Extract reporter info from Slack task data
   - Pass reporter info to Jira creation handler
   - Store reporter info in Jira confirmation modal data

3. `electron/main.ts`
   - Updated Jira creation handler to accept and pass `reporterName` and `reporterEmail`
   - Added reporter info to debug logging

### How It Works Now
1. When someone mentions the bot in Slack to create a Jira ticket, the Vercel webhook captures their Slack user info (email)
2. The email is passed through as `reporterEmail` to the Jira service
3. The Jira service looks up the user by email in Jira
4. If found, sets them as the reporter; otherwise falls back to the API user (Tommy)

### Important Notes
- **Requires "Modify Reporter" Permission**: In Jira, only users with the "Modify Reporter" permission can set a custom reporter. By default, only Jira admins have this permission.
- If Tommy's Jira account doesn't have this permission, the reporter field will be ignored and Tommy will still be set as reporter
- To grant this permission: Jira Settings → Issues → Permission Schemes → Edit the scheme → Add "Modify Reporter" permission to Tommy's role

---

## Testing Recommendations

### Test Issue 1 (Slack OAuth)
1. Have Will click "Connect" for Slack in Settings
2. Verify browser opens with Slack authorization page
3. If it fails, check that:
   - `.env` file has `SLACK_CLIENT_ID` and `OAUTH_REDIRECT_URI` configured
   - Error message is displayed in UI with helpful context
   - Can dismiss the error and try again

### Test Issue 2 (Jira Reporter)
1. Have Will mention the bot in Slack to create a Jira ticket
2. Complete the Jira creation flow
3. Check the created Jira ticket:
   - Reporter should be Will (if permission granted)
   - Check debug logs at `~/pm-os-jira-debug.log` to see reporter lookup details
4. If reporter is still Tommy:
   - Check that Tommy's Jira account has "Modify Reporter" permission
   - Check logs to see if Will's email was found in Jira

---

## Files Changed

1. `src/services/jira.ts` - Added reporter support
2. `src/components/Settings.tsx` - Added connection error handling and UI
3. `electron/slack-events.ts` - Pass reporter info
4. `electron/main.ts` - Enhanced OAuth error handling and reporter support

---

## Critical Setup Required

### For Each User (Will, Tommy, etc.):

1. **Configure Personal Email in PM-OS:**
   - Open PM-OS Settings → Personal tab
   - Enter YOUR email (must match your Slack account)
   - Example: Will enters `will@amplitude.com`
   - This email is used to route Slack tasks to the correct PM-OS instance

2. **Configure Jira Credentials:**
   - Settings → Integrations → Atlassian
   - Enter YOUR Jira email and API token
   - This ensures tickets use YOUR credentials

### For Vercel Webhook (Backend Update Needed):

⚠️ **The Vercel Slack webhook must be updated** to include the requester's email:

```javascript
// When processing Slack events, extract user's email:
const userInfo = await slack.users.info({ user: event.user });
const userEmail = userInfo.user.profile.email;

// Include in task data:
{
  ...taskData,
  reporterEmail: userEmail,  // or user_email
  reporterName: userInfo.user.real_name
}
```

Without this, task routing won't work and all tasks will be processed by whoever polls first.

---

## Next Steps

1. **Update Vercel webhook** to include requester email (see above)
2. **Deploy and test** the changes with Will
3. **Grant Jira permissions** if needed:
   - Jira Settings → Issues → Permission Schemes
   - Find the scheme used by your projects (e.g., "Default Permission Scheme")
   - Edit → Find "Modify Reporter" → Add Tommy's role/group
3. **Monitor logs** for any issues:
   - OAuth: `/tmp/pm-os-oauth-debug.log`
   - Jira: `~/pm-os-jira-debug.log`
   - Slack: `~/pm-os-slack-debug.log`
