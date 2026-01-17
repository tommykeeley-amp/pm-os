# PM-OS Chrome Extension

A Chrome extension for capturing tasks from any webpage and sending them to PM-OS. Opens in a **side panel on the right side of your browser**, similar to the PM-OS desktop app's pinned position.

## Features

- **Side panel interface** - Opens on the right side of your browser for easy access while browsing
- **Right-click context menu** - Add any page, selection, or link as a task
- **Quick task capture** - Fast task capture from current page
- **Capture page** - Save entire page as a task with URL
- **Capture selection** - Turn selected text into a task
- **Task management** - View, complete, and delete tasks
- **Sync with desktop** - Export tasks to PM-OS desktop app (coming soon)

## Requirements

- **Chrome 114 or later** (for Side Panel API support)
- Compatible with all Chromium-based browsers (Edge, Brave, etc.) with Side Panel support

## Installation

### 1. Create Icon Files

You need to create three icon files in the `icons` folder. You can use any PNG images (a simple purple square works for testing):

```bash
mkdir -p /Users/tommykeeley/pm-os/chrome-extension/icons
```

**Option A: Create simple colored icons using ImageMagick (if installed)**
```bash
# Install ImageMagick if needed
brew install imagemagick

# Create simple purple icons
cd /Users/tommykeeley/pm-os/chrome-extension
convert -size 16x16 xc:'#6366f1' icons/icon16.png
convert -size 48x48 xc:'#6366f1' icons/icon48.png
convert -size 128x128 xc:'#6366f1' icons/icon128.png
```

**Option B: Create icons using Python (if PIL is installed)**
```bash
cd /Users/tommykeeley/pm-os/chrome-extension
python3 << 'EOF'
from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('icons', exist_ok=True)

def create_icon(size, filename):
    # Create purple background
    img = Image.new('RGB', (size, size), '#6366f1')
    draw = ImageDraw.Draw(img)

    # Add white "PM" text
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', size // 3)
    except:
        font = ImageFont.load_default()

    text = "PM"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (size - text_width) // 2
    y = (size - text_height) // 2

    draw.text((x, y), text, fill='white', font=font)
    img.save(filename)

create_icon(16, 'icons/icon16.png')
create_icon(48, 'icons/icon48.png')
create_icon(128, 'icons/icon128.png')
print("Icons created successfully!")
EOF
```

**Option C: Manual creation**
1. Create the `icons` folder
2. Use any image editor (Preview, Photoshop, Figma, etc.)
3. Create three purple square images: 16x16, 48x48, and 128x128 pixels
4. Save them as `icon16.png`, `icon48.png`, and `icon128.png`

### 2. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the folder: `/Users/tommykeeley/pm-os/chrome-extension`
5. The extension should now appear in your extensions list

### 3. Pin the Extension (Optional)

1. Click the puzzle piece icon in Chrome toolbar
2. Find "PM-OS Task Capture"
3. Click the pin icon to keep it visible

## Usage

### Opening the Side Panel

1. Click the PM-OS extension icon in Chrome toolbar
2. The side panel opens on the **right side of your browser**
3. The panel stays open as you browse different tabs
4. Close it by clicking the X in the panel header

### Quick Add from Side Panel

1. With the side panel open, type your task in the input field
2. Press Enter or click the + button
3. Task is saved and will appear in your desktop app
4. The side panel remains open for adding more tasks

### Capture Current Page

1. Open the PM-OS side panel
2. Click "Capture Page" button
3. The page title and URL are saved as a task

### Capture Selected Text

1. Select text on any webpage
2. Open the PM-OS side panel (or have it already open)
3. Click "Selected Text" button
4. The selected text becomes your task title

### Right-Click Context Menu

1. Right-click anywhere on a page → "Add to PM-OS"
2. Right-click on selected text → "Add [selection] to PM-OS"
3. Right-click on a link → Link URL saved as task

## Desktop App Integration

Currently, tasks are stored in Chrome's local storage. To sync with your PM-OS desktop app:

1. Click the sync button in the extension popup
2. Tasks are copied to your clipboard as JSON
3. Paste into PM-OS desktop app (import feature coming soon)

### Future Integration

We'll add native messaging to automatically sync tasks between the extension and desktop app without manual copying.

## File Structure

```
chrome-extension/
├── manifest.json         # Extension configuration
├── background.js         # Service worker (context menu, storage)
├── content.js           # Content script (page interaction)
├── popup.html           # Popup UI
├── popup.js             # Popup functionality
├── styles.css           # Dark theme styling
├── icons/
│   ├── icon16.png      # 16x16 toolbar icon
│   ├── icon48.png      # 48x48 extension manager icon
│   └── icon128.png     # 128x128 Chrome Web Store icon
└── README.md           # This file
```

## Development

### Testing Changes

1. Make changes to any file
2. Go to `chrome://extensions/`
3. Click the refresh icon on the PM-OS extension card
4. Test your changes

### Debugging

- **Background script**: Right-click extension icon → "Inspect service worker"
- **Popup**: Right-click extension icon → "Inspect popup"
- **Content script**: Open DevTools on any page, check Console for errors

### Common Issues

**Extension doesn't load**
- Check that all icon files exist
- Verify manifest.json has no syntax errors
- Check Chrome DevTools console for errors

**Context menu doesn't appear**
- Extension may need to be reloaded
- Check background.js in service worker inspector

**Tasks not saving**
- Check Chrome storage in DevTools → Application → Storage → Local Storage
- Verify background.js message handlers are working

## Next Steps

1. ✅ Basic task capture
2. ✅ Context menu integration
3. ✅ Popup interface
4. 🔄 Desktop app sync via native messaging
5. 📋 Gmail-specific integration
6. 🎯 Auto-detect actionable content
7. 🔗 Deep linking to specific pages in PM-OS

## Tech Stack

- **Manifest V3** - Latest Chrome extension format
- **Vanilla JavaScript** - No framework dependencies
- **Chrome APIs** - contextMenus, storage, scripting, tabs
- **Dark Theme** - Matches PM-OS desktop design
