// Background script with WebSocket implementation
let activeConnections = {};

// Function to create a WebSocket connection
function createConnection(videoId, nickname, tabId) {
  console.log(
    `Creating WebSocket connection for video ${videoId}, nickname ${nickname}, tab ${tabId}`
  );

  // Close any existing connection for this tab
  if (activeConnections[tabId]) {
    activeConnections[tabId].socket.close();
    delete activeConnections[tabId];
  }

  try {
    // Create new WebSocket connection
    // Note: Using ws instead of wss for local testing - change to wss in production
    const socket = new WebSocket("wss://supreme-mica-mars.glitch.me");

    activeConnections[tabId] = {
      videoId,
      nickname,
      socket,
      connected: false,
    };

    // Handle connection open
    socket.onopen = () => {
      console.log(`WebSocket connected for tab ${tabId}`);
      // Send join message with videoId and nickname
      socket.send(
        JSON.stringify({
          type: "join",
          videoId: videoId,
          nickname: nickname,
        })
      );

      activeConnections[tabId].connected = true;

      // Notify content script
      chrome.tabs
        .sendMessage(tabId, {
          action: "socketConnected",
        })
        .catch((err) => console.error("Error sending message to tab:", err));
    };

    // Handle incoming messages
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`Received message for tab ${tabId}:`, data);

        // Forward message to content script
        chrome.tabs
          .sendMessage(tabId, {
            action: "socketMessage",
            data: data,
          })
          .catch((err) => console.error("Error sending message to tab:", err));
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    // Handle errors
    socket.onerror = (error) => {
      console.error(`WebSocket error for tab ${tabId}:`, error);
      chrome.tabs
        .sendMessage(tabId, {
          action: "socketError",
          error: "Connection error",
        })
        .catch((err) => console.error("Error sending message to tab:", err));
    };

    // Handle connection close
    socket.onclose = (event) => {
      console.log(
        `WebSocket closed for tab ${tabId}. Code: ${event.code}, Reason: ${event.reason}`
      );

      if (activeConnections[tabId]) {
        activeConnections[tabId].connected = false;
      }

      chrome.tabs
        .sendMessage(tabId, {
          action: "socketDisconnected",
        })
        .catch((err) => console.error("Error sending message to tab:", err));
    };

    return true;
  } catch (error) {
    console.error(`Error creating WebSocket for tab ${tabId}:`, error);
    return false;
  }
}

// Function to send a message through an active connection
function sendMessage(tabId, message, nickname) {
  const connection = activeConnections[tabId];

  console.log(
    `Attempting to send message for tab ${tabId}. Connection:`,
    connection ? `Active (Connected: ${connection.connected})` : "None"
  );

  if (
    connection &&
    connection.connected &&
    connection.socket.readyState === WebSocket.OPEN
  ) {
    try {
      connection.socket.send(
        JSON.stringify({
          type: "message",
          videoId: connection.videoId,
          nickname: nickname || connection.nickname,
          message: message,
        })
      );
      console.log(`Message sent successfully for tab ${tabId}`);
      return true;
    } catch (error) {
      console.error(`Error sending message for tab ${tabId}:`, error);
      return false;
    }
  } else {
    console.log(`Cannot send message for tab ${tabId} - socket not connected`);
    return false;
  }
}

// Function to close a connection
function closeConnection(tabId) {
  if (activeConnections[tabId]) {
    try {
      activeConnections[tabId].socket.close();
    } catch (e) {
      console.error(`Error closing WebSocket for tab ${tabId}:`, e);
    }
    delete activeConnections[tabId];
    return true;
  }
  return false;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) {
    console.error("Message received without valid tab ID");
    sendResponse({ success: false, error: "No tab ID" });
    return false;
  }

  console.log(`Received message from tab ${tabId}:`, request);

  try {
    switch (request.action) {
      case "connect":
        const success = createConnection(
          request.videoId,
          request.nickname,
          tabId
        );
        console.log(
          `Connection ${success ? "created" : "failed"} for tab ${tabId}`
        );
        sendResponse({ success });
        break;

      case "sendMessage":
        const messageSent = sendMessage(
          tabId,
          request.message,
          request.nickname
        );
        console.log(
          `Message ${messageSent ? "sent" : "failed"} for tab ${tabId}`
        );
        sendResponse({ success: messageSent });
        break;

      case "disconnect":
        const closed = closeConnection(tabId);
        console.log(
          `Connection ${closed ? "closed" : "not found"} for tab ${tabId}`
        );
        sendResponse({ success: closed });
        break;

      case "checkConnection":
        const isConnected = !!(
          activeConnections[tabId] &&
          activeConnections[tabId].connected &&
          activeConnections[tabId].socket.readyState === WebSocket.OPEN
        );
        console.log(
          `Connection status for tab ${tabId}: ${
            isConnected ? "Connected" : "Disconnected"
          }`
        );
        sendResponse({ connected: isConnected });
        break;

      default:
        console.log(`Unknown action for tab ${tabId}: ${request.action}`);
        sendResponse({ success: false, error: "Unknown action" });
    }
  } catch (error) {
    console.error(`Error handling message for tab ${tabId}:`, error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // Keep the message channel open for async responses
});

// Clean up connections when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  closeConnection(tabId);
});

// Listen for tab updates to detect navigation between videos
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com/watch")
  ) {
    console.log(`Tab ${tabId} navigated to YouTube video page`);
  }
});

// Log when the background script is loaded
console.log("YouTube Anonymous Chat: Background script loaded");
