// Add this at the top of your content.js file
console.log("YouTube Anonymous Chat: Content script loaded");

// Global variables
let chatContainer;
let videoId = null;
let nickname = generateNickname();
let isConnected = false;
let initComplete = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Function to extract video ID from URL
function getVideoIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("v");
}

// Function to generate a random nickname
function generateNickname() {
  const adjectives = [
    "Happy",
    "Funny",
    "Clever",
    "Swift",
    "Brave",
    "Calm",
    "Kind",
    "Wise",
    "Witty",
    "Jolly",
  ];
  const animals = [
    "Panda",
    "Tiger",
    "Eagle",
    "Dolphin",
    "Fox",
    "Wolf",
    "Owl",
    "Bear",
    "Lion",
    "Koala",
  ];

  const randomAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
  const randomNumber = Math.floor(Math.random() * 100);

  return `${randomAdjective}${randomAnimal}${randomNumber}`;
}

// Function to create the chat UI
function createChatUI() {
  console.log("YouTube Anonymous Chat: Creating UI");

  // Check if UI already exists
  if (document.getElementById("anonymous-chat-container")) {
    console.log("YouTube Anonymous Chat: UI already exists");
    return;
  }

  // Create chat container
  chatContainer = document.createElement("div");
  chatContainer.id = "anonymous-chat-container";
  chatContainer.innerHTML = `
    <div class="chat-header">
      <span>Anonymous Chat (${nickname})</span>
      <div class="chat-controls">
        <button id="minimize-chat">_</button>
        <button id="close-chat">×</button>
      </div>
    </div>
    <div class="chat-body">
      <div id="chat-messages"></div>
    </div>
    <div class="chat-footer">
      <input type="text" id="chat-input" placeholder="Type your message...">
      <button id="send-message">Send</button>
    </div>
  `;

  // Add to DOM
  document.body.appendChild(chatContainer);
  console.log("YouTube Anonymous Chat: UI appended to document");

  // Verify elements exist
  const messagesContainer = document.getElementById("chat-messages");
  if (!messagesContainer) {
    console.error(
      "YouTube Anonymous Chat: Failed to find chat-messages after creation"
    );
  }

  // Add event listeners
  document
    .getElementById("minimize-chat")
    ?.addEventListener("click", toggleMinimize);
  document.getElementById("close-chat")?.addEventListener("click", closeChat);
  document
    .getElementById("send-message")
    ?.addEventListener("click", sendMessage);
  document
    .getElementById("chat-input")
    ?.addEventListener("keypress", function (e) {
      if (e.key === "Enter") sendMessage();
    });
}

// Function to toggle chat minimize state
function toggleMinimize() {
  chatContainer?.classList.toggle("minimized");
}

// Function to close the chat
function closeChat() {
  disconnectSocket();
  chatContainer?.remove();
  chatContainer = null;
}

// Function to check connection status
function checkConnectionStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "checkConnection",
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error checking connection:", chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(response?.connected || false);
        }
      }
    );
  });
}

// Function to connect to WebSocket server via background script
function connectSocket(videoId) {
  console.log(
    "YouTube Anonymous Chat: Attempting to connect to WebSocket for video ID:",
    videoId
  );

  if (isConnected) {
    disconnectSocket();
  }

  reconnectAttempts = 0;

  // Send connection request to background script
  chrome.runtime.sendMessage(
    {
      action: "connect",
      videoId: videoId,
      nickname: nickname,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error connecting socket:", chrome.runtime.lastError);
        addSystemMessage("Error: Failed to connect to chat service.");
        return;
      }

      if (response && response.success) {
        console.log("YouTube Anonymous Chat: Connection request sent");
        addSystemMessage("Connecting to chat...");
      } else {
        console.error(
          "YouTube Anonymous Chat: Failed to send connection request"
        );
        addSystemMessage("Error: Failed to connect to chat.");
      }
    }
  );
}

// Function to disconnect from WebSocket server
function disconnectSocket() {
  if (isConnected) {
    chrome.runtime.sendMessage(
      {
        action: "disconnect",
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error disconnecting socket:",
            chrome.runtime.lastError
          );
        }

        isConnected = false;
        console.log("YouTube Anonymous Chat: Disconnected from server");
      }
    );
  }
}

// Function to attempt reconnection
function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(
      "YouTube Anonymous Chat: Maximum reconnection attempts reached"
    );
    addSystemMessage(
      "Failed to connect after multiple attempts. Please refresh the page."
    );
    return;
  }

  reconnectAttempts++;
  console.log(
    `YouTube Anonymous Chat: Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
  );

  setTimeout(() => {
    if (!isConnected && videoId) {
      connectSocket(videoId);
    }
  }, 2000 * reconnectAttempts); // Increasing delay between attempts
}

// Function to send a message
function sendMessage() {
  const inputElement = document.getElementById("chat-input");
  if (!inputElement) {
    console.error("YouTube Anonymous Chat: chat-input element not found");
    return;
  }

  const message = inputElement.value.trim();

  if (!message) {
    return;
  }

  if (!isConnected) {
    addSystemMessage("Not connected to chat. Reconnecting...");
    checkConnectionStatus().then((connected) => {
      if (connected) {
        isConnected = true;
        sendMessage(); // Try sending again
      } else {
        attemptReconnect();
      }
    });
    return;
  }

  // Basic client-side moderation
  if (moderateMessage(message)) {
    chrome.runtime.sendMessage(
      {
        action: "sendMessage",
        message: message,
        nickname: nickname,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
          addSystemMessage("Error: Failed to send message. Please try again.");
          return;
        }

        if (response && response.success) {
          inputElement.value = "";
          // Also display the message locally for immediate feedback
          addChatMessage(nickname, message);
        } else {
          addSystemMessage("Error: Failed to send message. Please try again.");
        }
      }
    );
  } else {
    addSystemMessage("Message blocked by moderation filter");
  }
}

// Basic client-side moderation function
function moderateMessage(message) {
  const forbiddenWords = [
    // Basic list of inappropriate terms to filter
    // Server will also have more robust filtering
  ];

  const lowerMessage = message.toLowerCase();
  return !forbiddenWords.some((word) => lowerMessage.includes(word));
}

// Function to add a chat message to the UI
function addChatMessage(nickname, message) {
  const messagesContainer = document.getElementById("chat-messages");
  if (!messagesContainer) {
    console.error("YouTube Anonymous Chat: chat-messages element not found");
    if (chatContainer) {
      // Element should exist but doesn't - try reinstantiating the UI
      createChatUI();
    }
    return;
  }

  const messageElement = document.createElement("div");
  messageElement.className = "chat-message";
  messageElement.innerHTML = `<span class="nickname">${nickname}:</span> ${message}`;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to add a system message to the UI
function addSystemMessage(message) {
  console.log("YouTube Anonymous Chat: System message:", message);

  const messagesContainer = document.getElementById("chat-messages");
  if (!messagesContainer) {
    console.error("YouTube Anonymous Chat: chat-messages element not found");
    if (chatContainer) {
      // Element should exist but doesn't - try reinstantiating the UI
      createChatUI();

      // Try again after recreating UI
      setTimeout(() => addSystemMessage(message), 100);
    }
    return;
  }

  const messageElement = document.createElement("div");
  messageElement.className = "system-message";
  messageElement.textContent = message;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to handle different types of socket messages
function handleSocketMessage(data) {
  switch (data.type) {
    case "message":
      // Don't show our own messages twice (we already added them locally)
      if (data.nickname !== nickname) {
        addChatMessage(data.nickname, data.message);
      }
      break;

    case "user-joined":
      addSystemMessage(`${data.nickname} joined the chat`);
      break;

    case "user-left":
      addSystemMessage(`${data.nickname} left the chat`);
      break;

    case "system":
      addSystemMessage(data.message);
      break;
  }
}

// Function to initialize the extension
function init() {
  console.log("YouTube Anonymous Chat: Initializing");
  console.log("Current URL:", window.location.href);

  // Only create UI on video pages
  if (!window.location.href.includes("youtube.com/watch")) {
    console.log(
      "YouTube Anonymous Chat: Not a video page, skipping initialization"
    );
    return;
  }

  // Create the UI
  createChatUI();

  // Verify UI elements
  if (!document.getElementById("anonymous-chat-container")) {
    console.error("YouTube Anonymous Chat: Failed to create UI");
    return;
  }

  // Get the current video ID
  const currentVideoId = getVideoIdFromUrl();
  if (currentVideoId) {
    console.log("YouTube Anonymous Chat: Found video ID:", currentVideoId);
    videoId = currentVideoId;
    connectSocket(videoId);
  } else {
    console.error(
      "YouTube Anonymous Chat: Could not extract video ID from URL"
    );
    addSystemMessage("Error: Could not determine video ID");
  }

  initComplete = true;

  // Listen for URL changes (for when users navigate between videos)
  setInterval(() => {
    const newVideoId = getVideoIdFromUrl();
    if (newVideoId && newVideoId !== videoId) {
      console.log("YouTube Anonymous Chat: Video changed to ID:", newVideoId);
      videoId = newVideoId;
      disconnectSocket();

      // Re-create UI for the new video
      if (chatContainer) {
        chatContainer.remove();
      }
      createChatUI();

      connectSocket(videoId);
    }
  }, 1000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  console.log(
    "YouTube Anonymous Chat: Message received from background script",
    message
  );

  switch (message.action) {
    case "socketConnected":
      isConnected = true;
      addSystemMessage("Connected to chat");
      break;

    case "socketDisconnected":
      const wasConnected = isConnected;
      isConnected = false;
      if (wasConnected) {
        addSystemMessage("Disconnected from chat");
        attemptReconnect();
      }
      break;

    case "socketMessage":
      handleSocketMessage(message.data);
      break;

    case "socketError":
      addSystemMessage(`Error: ${message.error}`);
      isConnected = false;
      attemptReconnect();
      break;
  }
});

// Initialize when DOM is fully loaded
console.log("YouTube Anonymous Chat: Script reached initialization point");
if (document.readyState === "loading") {
  console.log(
    "YouTube Anonymous Chat: Document still loading, adding DOMContentLoaded listener"
  );
  document.addEventListener("DOMContentLoaded", init);
} else {
  console.log(
    "YouTube Anonymous Chat: Document already loaded, initializing now"
  );
  init();
}

// Cleanup when the user leaves the page
window.addEventListener("beforeunload", () => {
  console.log("YouTube Anonymous Chat: Page unloading, disconnecting socket");
  disconnectSocket();
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("YouTube Anonymous Chat: Message received", request);

  if (request.action === "refresh") {
    console.log("YouTube Anonymous Chat: Refresh requested");

    // If chat container already exists, remove it
    const existingChat = document.getElementById("anonymous-chat-container");
    if (existingChat) {
      existingChat.remove();
      chatContainer = null;
    }

    // Disconnect any existing socket
    disconnectSocket();

    // Reset connection state
    isConnected = false;
    reconnectAttempts = 0;

    // Reinitialize
    init();

    sendResponse({ status: "refreshed" });
  }

  return true;
});
