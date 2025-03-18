document.addEventListener("DOMContentLoaded", function () {
  // Check if we're on a YouTube video page
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentUrl = tabs[0].url;
    const statusDiv = document.getElementById("status");

    if (currentUrl && currentUrl.includes("youtube.com/watch")) {
      statusDiv.textContent = "Active on this video";
      statusDiv.className = "status active";
    } else {
      statusDiv.textContent = "Navigate to a YouTube video";
      statusDiv.className = "status inactive";
    }
  });

  // Refresh button functionality
  document
    .getElementById("refresh-button")
    .addEventListener("click", function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "refresh" },
          function (response) {
            // Handle no response (which likely means content script didn't load)
            if (chrome.runtime.lastError) {
              console.log("Error sending message:", chrome.runtime.lastError);
              chrome.tabs.reload(tabs[0].id);
            }
          }
        );
      });
    });
});
