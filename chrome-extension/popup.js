// PM-OS Chrome Extension - Popup Script

let currentTab = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Auto-fill input with page title
  document.getElementById('taskInput').placeholder = `Add task from "${tab.title.substring(0, 30)}..."`;

  // Load tasks
  loadTasks();

  // Event listeners
  document.getElementById('taskForm').addEventListener('submit', handleAddTask);
  document.getElementById('capturePageBtn').addEventListener('click', capturePage);
  document.getElementById('captureSelectionBtn').addEventListener('click', captureSelection);
  document.getElementById('syncBtn').addEventListener('click', syncWithDesktop);
  document.getElementById('openDesktopBtn').addEventListener('click', openDesktopApp);
});

// Handle form submission
async function handleAddTask(e) {
  e.preventDefault();
  const input = document.getElementById('taskInput');
  const title = input.value.trim();

  if (!title) return;

  const task = {
    id: generateId(),
    title,
    completed: false,
    source: 'chrome-extension',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    context: `From: ${currentTab.title}`,
    url: currentTab.url,
    tags: []
  };

  await chrome.runtime.sendMessage({ action: 'addTask', task });

  input.value = '';
  loadTasks();
  showNotification('Task added!');
}

// Capture current page as task
async function capturePage() {
  const task = {
    id: generateId(),
    title: currentTab.title,
    completed: false,
    source: 'chrome-extension',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    context: `URL: ${currentTab.url}`,
    url: currentTab.url,
    tags: []
  };

  await chrome.runtime.sendMessage({ action: 'addTask', task });
  loadTasks();
  showNotification('Page captured!');
}

// Capture selected text
async function captureSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script to get selection
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
    const selectedText = response?.text;

    if (!selectedText || !selectedText.trim()) {
      showNotification('No text selected', 'error');
      return;
    }

    const task = {
      id: generateId(),
      title: selectedText.substring(0, 100),
      completed: false,
      source: 'chrome-extension',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      context: `From: ${currentTab.title}\nURL: ${currentTab.url}`,
      url: currentTab.url,
      tags: []
    };

    await chrome.runtime.sendMessage({ action: 'addTask', task });
    loadTasks();
    showNotification('Selection captured!');
  } catch (error) {
    console.error('Error capturing selection:', error);
    showNotification('Cannot select text on this page', 'error');
  }
}

// Load and display tasks
async function loadTasks() {
  const response = await chrome.runtime.sendMessage({ action: 'getTasks' });
  const tasks = response.tasks || [];

  const tasksList = document.getElementById('tasksList');
  const emptyState = document.getElementById('emptyState');
  const taskCount = document.getElementById('taskCount');

  taskCount.textContent = tasks.length;

  if (tasks.length === 0) {
    tasksList.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  tasksList.style.display = 'block';
  emptyState.style.display = 'none';

  // Show only last 5 tasks
  const recentTasks = tasks.slice(0, 5);

  tasksList.innerHTML = recentTasks.map(task => `
    <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <input
        type="checkbox"
        ${task.completed ? 'checked' : ''}
        onclick="toggleTask('${task.id}')"
        class="task-checkbox"
      />
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.context ? `<div class="task-context">${escapeHtml(task.context)}</div>` : ''}
      </div>
      <button onclick="deleteTask('${task.id}')" class="delete-btn" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `).join('');
}

// Toggle task completion
window.toggleTask = async function(taskId) {
  await chrome.runtime.sendMessage({ action: 'toggleTask', taskId });
  loadTasks();
};

// Delete task
window.deleteTask = async function(taskId) {
  await chrome.runtime.sendMessage({ action: 'deleteTask', taskId });
  loadTasks();
  showNotification('Task deleted');
};

// Sync with desktop app
async function syncWithDesktop() {
  const PM_OS_SERVER = 'http://localhost:54321';

  try {
    showNotification('Syncing with desktop app...');

    // Check if PM-OS is running
    const pingResponse = await fetch(`${PM_OS_SERVER}/ping`);
    if (!pingResponse.ok) {
      showNotification('Desktop app is not running', 'error');
      return;
    }

    // Get tasks from desktop app
    const response = await fetch(`${PM_OS_SERVER}/tasks`);
    if (!response.ok) {
      showNotification('Failed to sync with desktop app', 'error');
      return;
    }

    const data = await response.json();
    const desktopTasks = data.tasks || [];

    // Merge with local tasks (avoid duplicates)
    const localResponse = await chrome.runtime.sendMessage({ action: 'getTasks' });
    const localTasks = localResponse.tasks || [];

    const allTasks = [...desktopTasks, ...localTasks];
    const uniqueTasks = Array.from(
      new Map(allTasks.map(task => [task.id, task])).values()
    );

    // Save merged tasks to Chrome storage
    await chrome.storage.local.set({ tasks: uniqueTasks });

    loadTasks();
    showNotification(`Synced ${desktopTasks.length} tasks from desktop app`);
  } catch (error) {
    console.error('Sync error:', error);
    showNotification('Desktop app is not running', 'error');
  }
}

// Open desktop app (placeholder - would need protocol handler)
function openDesktopApp() {
  // In future, could use custom protocol like pmos://
  showNotification('Open PM-OS desktop app manually');
}

// Show notification
function showNotification(message, type = 'success') {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Generate unique ID
function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
