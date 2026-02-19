# Vercel Environment Variables Setup

## Required Environment Variables

Set these in Vercel Dashboard: https://vercel.com/dashboard → Your Project → Settings → Environment Variables

### 1. Slack OAuth
```
SLACK_CLIENT_ID=<your-slack-client-id>
SLACK_CLIENT_SECRET=<your-slack-client-secret>
```

Get these from: https://api.slack.com/apps → Your App → Basic Information

### 2. Google OAuth
```
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

Get these from: https://console.cloud.google.com/apis/credentials

### 3. OAuth Redirect URI
```
OAUTH_REDIRECT_URI=https://pm-os.vercel.app/oauth-callback
```

### 4. Atlassian OAuth
```
ATLASSIAN_CLIENT_ID=<your-atlassian-client-id>
ATLASSIAN_CLIENT_SECRET=<your-atlassian-client-secret>
```

Get these from: https://developer.atlassian.com/console/myapps

### 5. Slack Bot (Already Set)
```
SLACK_BOT_TOKEN=<your-slack-bot-token>
SLACK_SIGNING_SECRET=<your-slack-signing-secret>
```

## How to Set Variables

### Option 1: Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable one by one
5. Select all environments (Production, Preview, Development)

### Option 2: Vercel CLI
```bash
cd oauth-callback
vercel env add SLACK_CLIENT_ID
vercel env add SLACK_CLIENT_SECRET
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add ATLASSIAN_CLIENT_ID
vercel env add ATLASSIAN_CLIENT_SECRET
vercel env add OAUTH_REDIRECT_URI
```

## Deploy Changes

After setting variables, deploy:

```bash
cd oauth-callback
vercel deploy --prod
```

Or wait for auto-deploy from GitHub push (already done).

## Verify Setup

Test that the endpoints work:

```bash
# Should return 307 redirect to Slack
curl -I https://pm-os.vercel.app/api/oauth/slack/authorize

# Should return 307 redirect to Google
curl -I https://pm-os.vercel.app/api/oauth/google/authorize

# Should return 307 redirect to Atlassian
curl -I https://pm-os.vercel.app/api/oauth/jira/authorize
```

If you see errors, check that environment variables are set correctly.

## Quick Check

```bash
# Check Vercel deployment logs
vercel logs --prod

# Look for:
# [OAuth/Slack] Authorization request received
# [OAuth/Slack] Redirecting to Slack authorization page
```

## Done!

Once environment variables are set and deployed, users can connect their accounts without any .env files!
