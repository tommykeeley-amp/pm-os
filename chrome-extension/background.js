// Background service worker for PM-OS Chrome Extension

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addToPMOS',
    title: 'Add to PM-OS',
    contexts: ['page', 'selection', 'link']
  });

  chrome.contextMenus.create({
    id: 'addSelectionToPMOS',
    title: 'Add "%s" to PM-OS',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let taskTitle = '';
  let taskContext = '';

  if (info.menuItemId === 'addSelectionToPMOS' && info.selectionText) {
    // Selected text as task
    taskTitle = info.selectionText.substring(0, 100);
    taskContext = `From: ${tab.title}\nURL: ${tab.url}`;
  } else if (info.menuItemId === 'addToPMOS') {
    // Page as task
    if (info.linkUrl) {
      // Right-clicked on a link
      taskTitle = info.linkUrl;
      taskContext = `Link from: ${tab.title}`;
    } else {
      // Right-clicked on page
      taskTitle = tab.title;
      taskContext = `URL: ${tab.url}`;
    }
  }

  // Create the task
  const task = {
    id: generateId(),
    title: taskTitle,
    completed: false,
    source: 'chrome-extension',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    context: taskContext,
    url: info.linkUrl || tab.url,
    tags: []
  };

  // Save to storage
  await saveTask(task);

  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Task Added to PM-OS',
    message: taskTitle,
    priority: 1
  });
});

// Save task to Chrome storage
async function saveTask(task) {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];
  tasks.unshift(task);
  await chrome.storage.local.set({ tasks });

  // Also save to PM-OS desktop app if running
  try {
    await syncToPMOS(task);
  } catch (error) {
    console.log('Could not sync to PM-OS desktop app:', error);
  }
}

// Try to sync with PM-OS desktop app
async function syncToPMOS(task) {
  const PM_OS_SERVER = 'http://localhost:54321';

  try {
    // First check if PM-OS is running
    const pingResponse = await fetch(`${PM_OS_SERVER}/ping`);
    if (!pingResponse.ok) {
      console.log('PM-OS desktop app is not running');
      return;
    }

    // Send task to PM-OS
    const response = await fetch(`${PM_OS_SERVER}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task),
    });

    if (response.ok) {
      console.log('Task synced to PM-OS desktop app:', task.title);
    } else {
      console.log('Failed to sync task to PM-OS:', response.statusText);
    }
  } catch (error) {
    // Desktop app is not running or not accessible
    console.log('PM-OS desktop app is not accessible:', error.message);
  }
}

// Generate unique ID
function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTasks') {
    chrome.storage.local.get(['tasks']).then(result => {
      sendResponse({ tasks: result.tasks || [] });
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'addTask') {
    saveTask(request.task).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'deleteTask') {
    chrome.storage.local.get(['tasks']).then(result => {
      const tasks = (result.tasks || []).filter(t => t.id !== request.taskId);
      chrome.storage.local.set({ tasks }).then(() => {
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === 'toggleTask') {
    chrome.storage.local.get(['tasks']).then(result => {
      const tasks = result.tasks || [];
      const task = tasks.find(t => t.id === request.taskId);
      if (task) {
        task.completed = !task.completed;
        task.updatedAt = new Date().toISOString();
      }
      chrome.storage.local.set({ tasks }).then(() => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
});
