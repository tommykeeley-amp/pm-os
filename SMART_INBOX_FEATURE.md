# Smart Inbox Feature - Slack Digest

## Overview

The Smart Inbox sends you Slack DMs **3x per day** (9AM, 12PM, 5PM) with "Things you might have missed" - actionable items from your monitored Slack channels that haven't been completed yet.

## Key Features

### 1. **3x Daily Delivery**
- 🌅 **9:00 AM** - Morning catchup
- ☀️ **12:00 PM** - Midday check-in
- 🌆 **5:00 PM** - End of day wrap-up

Times honor your **primary timezone** (set in Settings → Personal)

### 2. **Smart Deduplication**
- Won't suggest messages that have already been suggested (within 7 days)
- Won't suggest messages where a task was already created
- Tracks completed/resolved threads automatically

### 3. **VIP Weighting**
Messages from VIP contacts (marked in settings) are weighted **30% higher** in priority scoring

### 4. **AI-Powered Analysis**
Uses GPT-4o-mini to:
- Identify actionable items (questions, requests, decisions needed, bugs, features)
- Generate summaries
- Suggest specific actions
- Assess urgency
- Determine relevance

### 5. **Priority Scoring (0-100)**
Messages are scored based on:
- **VIP Contact**: +30 points
- **High Urgency**: +15 points
- **Medium Urgency**: +5 points
- **Very Recent** (<2 hours): +10 points
- **Recent** (<6 hours): +5 points

Top 5 highest-scoring items are sent in each digest.

### 6. **One-Click Task Creation**
Each item has a "📝 Create Task" button that:
- Creates a task in PM-OS with context
- Marks the message as "task created" (won't appear in future digests)
- Preserves link to original Slack message

## Settings Configuration

### Location
Settings → Integrations → Slack → (Expand) → Smart Inbox Digest

### Options

1. **Enable/Disable Smart Inbox**
   - Toggle to receive 3x daily digests

2. **Monitored Channels**
   - Select which channels to scan for actionable items
   - DMs are always included if connected

3. **VIP Contacts**
   - Mark teammates whose messages should be prioritized
   - Their items get +30 priority boost

## Technical Architecture

### Components

**Frontend (Settings UI):**
- `SlackChannelsConfig.tsx` - Channel selection
- `SlackDailyDigestConfig.tsx` - VIP contacts + enable/disable

**Backend Service:**
- `slack-digest-service.ts` - Main digest engine

**State Management:**
- Stores digest state in `electron-store`:
  - `digestState.lastSent` - Last sent time for each slot (9AM, 12PM, 5PM)
  - `digestState.suggestedMessages` - Messages already suggested (messageId → timestamp)
  - `digestState.createdTasks` - Tasks created from messages (messageId → taskId)

### Workflow

1. **Scheduler**
   - Calculates next occurrence of 9AM, 12PM, 5PM in user's timezone
   - Sets timers for each slot

2. **Digest Generation** (runs at each scheduled time):
   - Fetches recent messages (last 24 hours) from monitored channels
   - Filters out:
     - Messages suggested in last 7 days
     - Messages with tasks already created
     - Messages older than 24 hours
   - Analyzes each message with AI
   - Scores and ranks by priority
   - Returns top 5

3. **Delivery**:
   - Looks up user's Slack ID by email
   - Sends DM with rich blocks:
     - Header
     - List of 5 items with summaries, actions, reasons
     - "Create Task" button for each item
     - Links to original messages
   - Updates `lastSent` timestamp

4. **Interaction Handling** (when user clicks button):
   - Receives interaction payload
   - Creates task in PM-OS
   - Marks message as having task created
   - Won't suggest again in future digests

### Deduplication Logic

```typescript
// Message suggested in last 7 days?
const suggestedTime = state.suggestedMessages[messageId];
if (suggestedTime && Date.now() - suggestedTime < 7 * 24 * 60 * 60 * 1000) {
  return false; // Skip
}

// Task already created from this message?
if (state.createdTasks[messageId]) {
  return false; // Skip
}
```

### AI Prompt

```
Analyze this Slack message and determine if it requires action from the user.

Message: "<message text>"
From: <user name>
Channel: #<channel name>

Determine:
1. Is this an actionable item? (question, request, decision needed, bug report, feature request, etc.)
2. What specific action should the user take?
3. Is it urgent or can it wait?
4. Brief summary (1 sentence)

Respond in JSON:
{
  "isActionable": boolean,
  "summary": "one sentence summary",
  "suggestedAction": "what the user should do",
  "urgency": "high" | "medium" | "low",
  "reason": "why this needs attention"
}
```

## Example Digest DM

```
🌅 Things You Might Have Missed

Here are 5 actionable items from your monitored channels:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Sarah asked about API rate limits for new endpoint
From Sarah Chen in #engineering
Respond with current rate limit details and whether we need to adjust
• From VIP contact
• High urgency
• Question directed at you

[📝 Create Task] [View message]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. Bug report: Users can't upload files larger than 10MB
From Alex Johnson in #bugs
Investigate file upload size limits and increase if needed
• High urgency
• Bug report needs triage

[📝 Create Task] [View message]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. Design team needs feedback on new dashboard mockups
From Design Team in #product
Review mockups and provide feedback by EOD
• From VIP contact
• Feedback requested

[📝 Create Task] [View message]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. Tommy mentioned you should review the security audit findings
From Tommy Keeley in #security
Review security audit report and action items
• From VIP contact
• You were mentioned

[📝 Create Task] [View message]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. Question about deployment schedule for next release
From Will in #releases
Clarify deployment timeline and coordinate with team
• Medium urgency
• Decision needed

[📝 Create Task] [View message]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Tasks created from these items won't appear in future digests
```

## User Benefits

1. **No Context Switching** - All actionable items in one place, 3x per day
2. **Smart Filtering** - Only see things that need your attention
3. **VIP Prioritization** - Important people's messages float to top
4. **No Duplicates** - Never see same item twice
5. **One-Click Action** - Create tasks instantly
6. **Timezone Aware** - Delivered at right times for your location
7. **Auto-Cleanup** - Completed items automatically excluded

## Future Enhancements

Potential additions:
- Custom time slots (user configurable)
- Snooze/dismiss items
- Mark as "not actionable" feedback loop
- Weekly summary of completed items
- Team digest aggregation
- Integration with calendar for "focus time" blocking
- Mobile push notifications
- Email digest option

## Logs

Debug logs written to: `~/pm-os-digest-debug.log`

Check logs:
```bash
tail -f ~/pm-os-digest-debug.log
```

## Settings Required

For Smart Inbox to work:
1. ✅ Slack connected (OAuth)
2. ✅ OpenAI API key configured
3. ✅ Primary timezone set (Settings → Personal)
4. ✅ Email set (must match Slack email)
5. ✅ At least one channel monitored
6. ✅ Smart Inbox enabled

## Privacy

- Only scans channels you explicitly select
- Messages are analyzed locally with OpenAI (not stored)
- Digest state (suggested/completed) stored locally in electron-store
- No data sent to external services except OpenAI for analysis

---

**Status**: Implemented, ready for testing
**Next**: Handle interactive buttons for task creation from Slack DMs
