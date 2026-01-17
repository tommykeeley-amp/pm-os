# PM-OS Chrome Extension Changelog

## Version 1.1.0 - Desktop App Sync (2026-01-17)

### Major Features

**Automatic Desktop Sync** - Tasks now automatically sync between the Chrome extension and PM-OS desktop app in real-time!

#### What's New:

1. **Real-time Sync**
   - Tasks added in extension automatically appear in desktop app
   - Desktop app runs HTTP server on `localhost:54321`
   - No manual export/import needed

2. **Fixed Selected Text Capture**
   - Now uses content script messaging instead of `executeScript`
   - Fixes "cannot select text" errors
   - More reliable across different page types

3. **Bi-directional Sync**
   - Sync button (🔄) pulls tasks from desktop app to extension
   - Automatic deduplication by task ID
   - Merged storage between Chrome and desktop app

#### Technical Changes:

**Chrome Extension:**
- `popup.js`: Updated `captureSelection()` to use content script messaging
- `popup.js`: Updated `syncWithDesktop()` to fetch tasks from HTTP server
- `background.js`: Updated `syncToPMOS()` to POST tasks to desktop app

**Desktop App (main.ts):**
- Added HTTP server on port 54321
- Endpoints: `GET /ping`, `GET /tasks`, `POST /tasks`
- CORS enabled for Chrome extension requests
- Tasks automatically saved to Electron store

### Benefits:

- **Seamless workflow** - Capture tasks in browser, manage in desktop app
- **No data loss** - Tasks saved in both Chrome storage and desktop app
- **Automatic sync** - Works when desktop app is running
- **Graceful fallback** - Extension still works offline in Chrome storage

### Requirements:

- PM-OS desktop app must be running for automatic sync
- Desktop app version 0.1.0+ (with HTTP server support)

## Version 1.0.0 - Side Panel Update

### Major Changes

**Side Panel Interface** - The extension now opens in Chrome's side panel on the right side of your browser, providing a persistent workspace similar to the PM-OS desktop app's pinned position.

#### What Changed:

1. **manifest.json**
   - Added `sidePanel` permission
   - Configured `side_panel` with default path
   - Removed `default_popup` from action (now opens side panel instead)

2. **background.js**
   - Added `chrome.action.onClicked` listener to open side panel
   - Maintains all existing context menu functionality

3. **styles.css**
   - Updated body width to `100%` (was fixed `360px`)
   - Changed height to `100vh` (full viewport height)
   - Side panel is resizable by user

4. **Documentation**
   - Updated README.md with side panel usage
   - Updated INSTALL.md with side panel testing instructions
   - Added Chrome 114+ requirement

### Benefits of Side Panel:

- **Persistent workspace** - Panel stays open while browsing different tabs
- **Better ergonomics** - Larger, resizable interface on the right side
- **Consistent UX** - Matches PM-OS desktop app's right-side pinned position
- **Multi-tasking** - Manage tasks while viewing web content side-by-side

### Requirements:

- Chrome 114 or later (for Side Panel API support)
- Works with Chromium-based browsers (Edge, Brave, etc.) that support side panels

### Compatibility:

All existing features work exactly the same:
- Context menu (right-click to add tasks)
- Capture page functionality
- Capture selection functionality
- Task management (view, complete, delete)
- Chrome storage integration

### Migration Notes:

If you already have the extension installed:
1. Go to `chrome://extensions/`
2. Click the refresh icon on PM-OS Task Capture
3. Click the extension icon - it will now open in the side panel

No data loss - all existing tasks in Chrome storage are preserved.
