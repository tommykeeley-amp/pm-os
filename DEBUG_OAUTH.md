# Slack OAuth Connection Debugging Guide

## For Will: Run These Checks

### Check 1: Open Developer Console in PM-OS
1. Open PM-OS app
2. Go to Settings → Integrations
3. **Open DevTools:** Press `Cmd+Option+I` (or right-click → Inspect)
4. Go to the **Console** tab
5. Click **"Connect"** for Slack
6. **Copy all console output** and send to Tommy

Look for messages like:
- `[Settings] Starting OAuth flow for slack...`
- `[OAuth] Opening slack auth URL...`
- Any red error messages

---

### Check 2: Test if Browser Opens
When you click "Connect" for Slack:
- **Does your browser open?** YES / NO
- **If yes, what URL does it show?**
- **If no, do you see any error message?**

---

### Check 3: Check App Logs
Run this in Terminal:
```bash
# Check OAuth logs
tail -20 /tmp/pm-os-oauth-debug.log

# Check if PM-OS is running
ps aux | grep "PM-OS.app" | grep -v grep
```

Send the output to Tommy.

---

## For Tommy: Things to Check

### 1. Is the .env file included in Will's build?

Will's PM-OS app should have the OAuth credentials. Check:
```bash
# If Will has the app in Applications
ls -la /Applications/PM-OS.app/Contents/Resources/app.asar.unpacked/.env

# Or if running from release folder
ls -la ~/pm-os/release/mac-arm64/PM-OS.app/Contents/Resources/app.asar.unpacked/.env
```

### 2. Is the pmos:// protocol handler registered?

The OAuth callback uses `pmos://` protocol. Check if it's registered:
```bash
# Check protocol registration
defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist | grep -A5 pmos
```

### 3. Try Direct Browser Test

Have Will manually open this URL in his browser (replace the state):
```
https://slack.com/oauth/v2/authorize?client_id=2359418194.10341216410784&scope=app_mentions:read,chat:write&user_scope=channels:read,channels:history,groups:read,groups:history,mpim:history,im:read,im:history,users:read,stars:read,search:read&redirect_uri=https://pm-os.vercel.app/oauth-callback&state=eyJwcm92aWRlciI6InNsYWNrIn0=
```

- Does it show the Slack authorization page?
- After authorizing, does it redirect back?
- Does PM-OS app open?

---

## Common Issues & Fixes

### Issue 1: Browser Doesn't Open
**Cause:** Permission issue or `shell.openExternal` failing
**Fix:** Grant PM-OS permission to open URLs
```bash
# Reset permissions
tccutil reset SystemPolicyAllFiles com.tommykeeley.pmos
```

### Issue 2: Protocol Not Registered
**Cause:** PM-OS app not registered as handler for `pmos://`
**Fix:** Reinstall the app:
```bash
# Remove old app
rm -rf /Applications/PM-OS.app

# Install fresh from DMG
open ~/pm-os/release/PM-OS-0.1.0-arm64.dmg
# Drag to Applications
```

### Issue 3: Missing .env File
**Cause:** .env not packaged in the build
**Fix:** Rebuild with .env included:
```bash
cd ~/pm-os
npm run electron:build
```

### Issue 4: Firewall Blocking Redirect
**Cause:** Corporate firewall blocking Vercel redirects
**Fix:** Check if `pm-os.vercel.app` is accessible:
```bash
curl -I https://pm-os.vercel.app/oauth-callback
```

---

## Quick Test: Check OAuth Credentials

Run this in PM-OS DevTools Console:
```javascript
// Check if credentials are loaded
window.electronAPI.getSettings().then(settings => {
  console.log('Has OpenAI key:', !!settings.openaiApiKey);
  console.log('OAuth redirect URI:', settings.oauthRedirectUri || 'NOT SET');
});
```

---

## Nuclear Option: Fresh Install

If nothing works:
1. Quit PM-OS completely
2. Delete all PM-OS data:
   ```bash
   rm -rf ~/Library/Application\ Support/pm-os
   rm -rf /Applications/PM-OS.app
   ```
3. Reinstall from latest DMG:
   ```bash
   open ~/pm-os/release/PM-OS-0.1.0-arm64.dmg
   ```
4. Try connecting again
