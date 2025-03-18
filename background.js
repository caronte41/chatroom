// Background script for the YouTube Anonymous Chat extension

// Listen for tab updates to detect navigation between videos
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com/watch")
  ) {
    // The content script handles the actual detection and connection
    // This just ensures our extension is active on YouTube video pages
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "logActivity") {
    console.log(`Activity from tab ${sender.tab.id}: ${request.data}`);
  }
  return true;
});
