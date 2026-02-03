# Server-Side OAuth Architecture

## Overview

OAuth credentials are now stored **server-side on Vercel** instead of in client .env files. This provides:

✅ **Better Security** - CLIENT_SECRET never leaves the server
✅ **Easier Distribution** - No need to share .env files with users
✅ **Centralized Management** - Update credentials in one place (Vercel)
✅ **Scalable** - All users automatically use the correct OAuth app

## Architecture

### Old Flow (Client-Side):
```
PM-OS app (has CLIENT_ID/SECRET)
  → Opens OAuth URL directly
  → Provider authorizes
  → Callback to Vercel
  → Vercel exchanges code for tokens
  → PM-OS receives tokens
```

### New Flow (Server-Side):
```
PM-OS app (no credentials needed)
  → Opens Vercel endpoint: /api/oauth/{provider}/authorize
  → Vercel builds OAuth URL with server-side credentials
  → Redirects to Provider authorization page
  → Provider redirects back to Vercel callback
  → Vercel exchanges code for tokens (server-side)
  → Vercel redirects to pmos:// protocol
  → PM-OS receives tokens
```

## Vercel Environment Variables Required

Set these in your Vercel project settings (https://vercel.com/dashboard → Settings → Environment Variables):

### Slack OAuth
```bash
SLACK_CLIENT_ID=<your-slack-client-id>
SLACK_CLIENT_SECRET=<your-slack-client-secret>
```

### Google OAuth
```bash
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

### OAuth Callback
```bash
OAUTH_REDIRECT_URI=https://pm-os.vercel.app/oauth-callback
```

### Session Storage
```bash
SLACK_BOT_TOKEN=<your-slack-bot-token>
SLACK_SIGNING_SECRET=<your-slack-signing-secret>
```

## API Endpoints Created

### 1. `/api/oauth/slack/authorize` (GET)
- **Purpose:** Initiates Slack OAuth flow
- **What it does:**
  - Reads SLACK_CLIENT_ID from Vercel env
  - Builds Slack OAuth URL with proper scopes
  - Redirects user to Slack authorization page
- **Called by:** PM-OS app when user clicks "Connect Slack"

### 2. `/api/oauth/google/authorize` (GET)
- **Purpose:** Initiates Google OAuth flow
- **What it does:**
  - Reads GOOGLE_CLIENT_ID from Vercel env
  - Builds Google OAuth URL with calendar/gmail scopes
  - Redirects user to Google authorization page
- **Called by:** PM-OS app when user clicks "Connect Google"

### 3. `/oauth-callback` (Already existed)
- **Purpose:** Handles OAuth callback from providers
- **What it does:**
  - Receives authorization code
  - Exchanges code for tokens using CLIENT_SECRET (server-side)
  - Stores tokens temporarily in session
  - Redirects to pmos:// protocol with sessionId
- **Called by:** Provider (Slack/Google) after user authorizes

### 4. `/api/exchange-token` (Already existed)
- **Purpose:** Exchanges sessionId for tokens
- **Called by:** PM-OS app after protocol handler receives sessionId

## Client App Changes

### electron/main.ts
**Before:**
```typescript
// Built OAuth URLs locally with credentials from .env
const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&...`;
await shell.openExternal(authUrl);
```

**After:**
```typescript
// Simply opens Vercel endpoint - no credentials needed
const authUrl = `https://pm-os.vercel.app/api/oauth/slack/authorize`;
await shell.openExternal(authUrl);
```

### .env File (Client-Side)
**Now OPTIONAL** - Only needed for:
- OpenAI API key (still required for AI features)
- Token refresh (optional - for automatic token refresh without re-auth)
- Development/testing

**Not needed for:**
- OAuth connection (handled server-side)
- Initial setup
- Distribution to users

## Setup Instructions

### For Vercel (One-Time Setup):

1. **Set Environment Variables**
   ```bash
   cd oauth-callback
   vercel env add SLACK_CLIENT_ID
   vercel env add SLACK_CLIENT_SECRET
   vercel env add GOOGLE_CLIENT_ID
   vercel env add GOOGLE_CLIENT_SECRET
   vercel env add OAUTH_REDIRECT_URI
   ```

2. **Deploy**
   ```bash
   vercel deploy --prod
   ```

3. **Verify endpoints work:**
   ```bash
   # Should redirect to Slack
   curl -I https://pm-os.vercel.app/api/oauth/slack/authorize

   # Should redirect to Google
   curl -I https://pm-os.vercel.app/api/oauth/google/authorize
   ```

### For Users (No Setup Required!):

1. **Install PM-OS** (from DMG)
2. **Open Settings → Integrations**
3. **Click "Connect"** for Slack/Google
4. **Authorize in browser**
5. **Done!** ✅

No .env file needed, no credentials to configure!

## Token Refresh (Optional)

Token refresh can still work with local credentials if available:

**With .env (automatic refresh):**
```env
GOOGLE_CLIENT_SECRET=your-secret-here
SLACK_CLIENT_SECRET=your-secret-here
```

**Without .env (manual re-auth):**
- When tokens expire, user just clicks "Connect" again
- Flow is quick since they're already authorized

## Migration Guide

### From Old Architecture:

1. ✅ Deploy Vercel changes (new API routes)
2. ✅ Set Vercel environment variables
3. ✅ Rebuild PM-OS app (uses new endpoints)
4. ✅ Distribute new DMG to users
5. ⚠️ Users don't need to do anything! Old tokens still work

### Backward Compatibility:

- Existing tokens remain valid
- Old .env files still work (but not required)
- No breaking changes for existing users

## Security Improvements

### Before:
- ❌ CLIENT_SECRET in every user's .env file
- ❌ Risk of credentials being leaked/shared
- ❌ No way to rotate secrets without redistributing .env

### After:
- ✅ CLIENT_SECRET only on Vercel (server-side)
- ✅ Rotate secrets in Vercel dashboard anytime
- ✅ No credentials in client app
- ✅ Standard OAuth 2.0 best practices

## Testing

### Test Slack OAuth:
1. Open PM-OS
2. Go to Settings → Integrations
3. Click "Connect" for Slack
4. Browser should open to Vercel → Slack
5. Authorize on Slack
6. Should redirect back to PM-OS
7. Status should show "Connected"

### Check Logs:
```bash
# OAuth flow logging
tail -f /tmp/pm-os-oauth-debug.log

# Should show:
# [OAuth] Opening Vercel authorization endpoint...
# [OAuth] URL: https://pm-os.vercel.app/api/oauth/slack/authorize
# [OAuth] ✓ Browser opened successfully
```

## Troubleshooting

### "OAuth not configured" error:
- **Cause:** Vercel env vars not set
- **Fix:** Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, etc. in Vercel

### Browser doesn't open:
- **Cause:** Permission issue or app not signed
- **Fix:** Right-click PM-OS → Open (first time)

### "Failed to fetch tokens":
- **Cause:** OAUTH_REDIRECT_URI mismatch
- **Fix:** Ensure Vercel has `OAUTH_REDIRECT_URI=https://pm-os.vercel.app/oauth-callback`

### Redirect URI mismatch in provider:
- **Cause:** Slack/Google app not configured with callback URL
- **Fix:** Add `https://pm-os.vercel.app/oauth-callback` to provider's OAuth settings

## Files Changed

### New Files:
- `oauth-callback/app/api/oauth/slack/authorize/route.ts` - Slack OAuth initiator
- `oauth-callback/app/api/oauth/google/authorize/route.ts` - Google OAuth initiator

### Modified Files:
- `electron/main.ts` - Simplified OAuth flow to use Vercel endpoints
- `OAUTH_SERVER_SIDE.md` - This documentation

### Removed Dependencies:
- Client-side OAuth URL building
- .env requirement for OAuth credentials

## Summary

🎉 **OAuth is now fully server-side!**

- No .env files to distribute
- More secure (secrets stay on server)
- Easier for users (just click Connect)
- Centralized credential management
- Standard OAuth 2.0 flow

Users can now connect their Slack/Google accounts without any setup or configuration files!
