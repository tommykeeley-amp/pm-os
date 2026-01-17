# Quick Installation Guide

## Load the Extension in Chrome

1. **Open Chrome Extensions page**
   - Navigate to: `chrome://extensions/`
   - Or: Chrome menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to and select: `/Users/tommykeeley/pm-os/chrome-extension`
   - Click "Select"

4. **Verify Installation**
   - You should see "PM-OS Task Capture" in your extensions list
   - The extension should have a purple "PM" icon

5. **Pin the Extension (Recommended)**
   - Click the puzzle piece icon (🧩) in Chrome toolbar
   - Find "PM-OS Task Capture"
   - Click the pin icon to keep it visible in your toolbar

## Using the Side Panel

The extension opens in a **side panel on the right side of your browser**, similar to the PM-OS desktop app:

- Click the PM-OS icon in your toolbar to open the side panel
- The panel stays open while you browse different tabs
- Resize the panel by dragging the left edge
- The side panel provides a persistent workspace for managing tasks

## Test the Extension

### Test 1: Context Menu
1. Right-click anywhere on a webpage
2. You should see "Add to PM-OS" option
3. Click it - you should get a notification

### Test 2: Selection Capture
1. Select some text on any webpage
2. Right-click on the selection
3. You should see "Add '[selected text]' to PM-OS"
4. Click it - notification should appear

### Test 3: Side Panel
1. Click the PM-OS extension icon in your toolbar
2. The side panel should open on the right side with:
   - Input field (pre-filled with current page title)
   - "Capture Page" button
   - "Selected Text" button
   - Recent tasks list (empty initially)
3. The panel should remain open as you browse different tabs

### Test 4: Create Task
1. In the side panel, type "Test task from Chrome"
2. Press Enter or click the + button
3. Task should appear in the "Recent Tasks" list below
4. You can check/uncheck and delete it
5. The side panel stays open for continuous task management

## Troubleshooting

**Extension doesn't appear**
- Make sure Developer mode is enabled
- Check for error messages in the extensions page
- Try reloading the extension (refresh icon)

**Context menu doesn't show**
- Reload the extension
- Click the service worker "Inspect" link and check for errors

**Side panel doesn't open**
- Make sure you're using Chrome 114 or later (Side Panel API requirement)
- Try reloading the extension
- Right-click in the side panel → Inspect to check for errors

**Tasks not saving**
- Open DevTools (F12) → Application → Storage → Local Storage
- Look for `chrome-extension://[extension-id]`
- Check if tasks are being stored

## Next Steps

### Desktop App Sync (Coming Soon)
Currently, tasks are only stored in Chrome. To export to PM-OS desktop:

1. Click the sync button (🔄) in the popup
2. Tasks are copied to clipboard as JSON
3. You can manually import them to PM-OS

We'll add automatic native messaging sync in a future update.

### Uninstall
1. Go to `chrome://extensions/`
2. Find "PM-OS Task Capture"
3. Click "Remove"
