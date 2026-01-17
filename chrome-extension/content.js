// Content script for PM-OS Chrome Extension
// This script runs on all web pages and can be used for enhanced features

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelection') {
    const selectedText = window.getSelection().toString();
    sendResponse({ text: selectedText });
  }
  return true;
});

// Could be extended in the future for:
// - Highlighting selected text when adding as task
// - Showing inline task creation UI
// - Auto-detecting actionable content on pages
// - Integration with specific websites (Gmail, Trello, etc.)

console.log('PM-OS Task Capture extension loaded');
