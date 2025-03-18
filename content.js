// Global variables
let chatContainer;
let socket;
let videoId = null;
let nickname = generateNickname();
let isConnected = false;

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

  document.body.appendChild(chatContainer);

  // Add event listeners
  document
    .getElementById("minimize-chat")
    .addEventListener("click", toggleMinimize);
  document.getElementById("close-chat").addEventListener("click", closeChat);
  document
    .getElementById("send-message")
    .addEventListener("click", sendMessage);
  document
    .getElementById("chat-input")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") sendMessage();
    });
}

// Function to toggle chat minimize state
function toggleMinimize() {
  chatContainer.classList.toggle("minimized");
}

// Function to close the chat
function closeChat() {
  disconnectSocket();
  chatContainer.remove();
}

// Function to connect to WebSocket server
function connectSocket(videoId) {
  if (isConnected) {
    disconnectSocket();
  }

  // Using Socket.IO with glitch.me (free hosting)
  socket = io("https://youtube-anon-chat.glitch.me", {
    query: {
      videoId: videoId,
      nickname: nickname,
    },
  });

  socket.on("connect", () => {
    isConnected = true;
    addSystemMessage("Connected to chat");
  });

  socket.on("disconnect", () => {
    isConnected = false;
    addSystemMessage("Disconnected from chat");
  });

  socket.on("chat-message", (data) => {
    addChatMessage(data.nickname, data.message);
  });

  socket.on("user-joined", (data) => {
    addSystemMessage(`${data.nickname} joined the chat`);
  });

  socket.on("user-left", (data) => {
    addSystemMessage(`${data.nickname} left the chat`);
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
    addSystemMessage("Connection error. Please try again later.");
  });
}

// Function to disconnect from WebSocket server
function disconnectSocket() {
  if (socket && isConnected) {
    socket.disconnect();
    isConnected = false;
  }
}

// Function to send a message
function sendMessage() {
  const inputElement = document.getElementById("chat-input");
  const message = inputElement.value.trim();

  if (message && isConnected) {
    // Basic client-side moderation
    if (moderateMessage(message)) {
      socket.emit("chat-message", {
        nickname: nickname,
        message: message,
      });
      inputElement.value = "";
    } else {
      addSystemMessage("Message blocked by moderation filter");
    }
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
  const messageElement = document.createElement("div");
  messageElement.className = "chat-message";
  messageElement.innerHTML = `<span class="nickname">${nickname}:</span> ${message}`;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to add a system message to the UI
function addSystemMessage(message) {
  const messagesContainer = document.getElementById("chat-messages");
  const messageElement = document.createElement("div");
  messageElement.className = "system-message";
  messageElement.textContent = message;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to initialize the extension
function init() {
  // Only create UI on video pages
  if (!window.location.href.includes("youtube.com/watch")) {
    return;
  }

  createChatUI();

  // Get the current video ID
  const currentVideoId = getVideoIdFromUrl();
  if (currentVideoId) {
    videoId = currentVideoId;
    connectSocket(videoId);
  }

  // Listen for URL changes (for when users navigate between videos)
  setInterval(() => {
    const newVideoId = getVideoIdFromUrl();
    if (newVideoId && newVideoId !== videoId) {
      videoId = newVideoId;
      disconnectSocket();
      connectSocket(videoId);
      document.getElementById("chat-messages").innerHTML = "";
      addSystemMessage(`Connected to chat for new video`);
    }
  }, 1000);
}

// Initialize when DOM is fully loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Cleanup when the user leaves the page
window.addEventListener("beforeunload", () => {
  disconnectSocket();
});
