const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const Filter = require("bad-words");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const filter = new Filter();

// Store active rooms (video IDs) and their users
const rooms = {};

// Simple rate limiting
const rateLimits = {};

// Basic health check endpoint
app.get("/", (req, res) => {
  res.send("YouTube Anonymous Chat server is running");
});

// Enable CORS for WebSocket connections
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

wss.on("connection", (ws) => {
  // Assign a unique ID to each connection
  const connectionId = uuidv4();
  console.log(`New connection established: ${connectionId}`);

  let userData = {
    connectionId,
    videoId: null,
    nickname: null,
    joinTime: new Date(),
    messageCount: 0,
  };

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received message from ${connectionId}:`, data);

      // Handle join request
      if (data.type === "join") {
        // Store user data
        userData.videoId = data.videoId;
        userData.nickname = data.nickname;

        console.log(
          `User ${userData.nickname} (${connectionId}) joined video: ${userData.videoId}`
        );

        // Initialize room if it doesn't exist
        if (!rooms[userData.videoId]) {
          rooms[userData.videoId] = {
            users: {},
            messageCount: 0,
            createdAt: new Date(),
          };
        }

        // Add user to the room
        rooms[userData.videoId].users[connectionId] = {
          nickname: userData.nickname,
          joinTime: userData.joinTime,
          ws: ws,
        };

        // Initialize rate limit tracking
        rateLimits[connectionId] = {
          lastMessageTime: Date.now(),
          messageCount: 0,
          resetTime: Date.now() + 60000, // 1 minute window
        };

        // Broadcast that a user joined to all clients in the room
        broadcastToRoom(
          userData.videoId,
          {
            type: "user-joined",
            nickname: userData.nickname,
          },
          ws
        );

        // Let the user know how many people are in the room
        const userCount = Object.keys(rooms[userData.videoId].users).length;
        ws.send(
          JSON.stringify({
            type: "system",
            message: `${userCount} ${
              userCount === 1 ? "person is" : "people are"
            } watching this video`,
          })
        );

        console.log(`Room ${userData.videoId} now has ${userCount} users`);
        return;
      }

      // Handle chat messages
      if (data.type === "message" && userData.videoId) {
        // Rate limiting
        const now = Date.now();
        const rateLimit = rateLimits[connectionId];

        // Reset rate limit counter if window expired
        if (now > rateLimit.resetTime) {
          rateLimit.messageCount = 0;
          rateLimit.resetTime = now + 60000; // 1 minute window
        }

        // Check if user is sending too many messages
        if (rateLimit.messageCount >= 10) {
          // 10 messages per minute
          ws.send(
            JSON.stringify({
              type: "system",
              message:
                "You are sending messages too quickly. Please wait a moment.",
            })
          );
          return;
        }

        // Update rate limit counter
        rateLimit.messageCount++;
        rateLimit.lastMessageTime = now;

        // Server-side message moderation
        if (data.message && typeof data.message === "string") {
          try {
            // Prevent extremely long messages
            let messageText = data.message;
            if (messageText.length > 200) {
              messageText = messageText.substring(0, 200) + "...";
            }

            // Filter profanity
            const cleanMessage = filter.clean(messageText);

            // Update user and room message counts
            userData.messageCount++;
            rooms[userData.videoId].messageCount++;

            console.log(
              `Broadcasting message from ${userData.nickname} (${connectionId}) to room ${userData.videoId}`
            );

            // Broadcast to all clients in the room
            broadcastToRoom(userData.videoId, {
              type: "message",
              nickname: userData.nickname,
              message: cleanMessage,
            });
          } catch (error) {
            console.error("Error processing message:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log(`Connection closed: ${connectionId}`);
    if (userData.videoId && rooms[userData.videoId]) {
      // Let others know user left
      broadcastToRoom(
        userData.videoId,
        {
          type: "user-left",
          nickname: userData.nickname,
        },
        ws
      );

      // Remove user from room
      if (rooms[userData.videoId].users[connectionId]) {
        delete rooms[userData.videoId].users[connectionId];

        // Clean up rate limit data
        delete rateLimits[connectionId];

        // Clean up empty rooms
        if (Object.keys(rooms[userData.videoId].users).length === 0) {
          delete rooms[userData.videoId];
          console.log(`Room ${userData.videoId} deleted (empty)`);
        } else {
          const userCount = Object.keys(rooms[userData.videoId].users).length;
          console.log(
            `Room ${userData.videoId} now has ${userCount} users after departure`
          );
        }
      }
    }
  });
});

// Function to broadcast a message to all clients in a room
function broadcastToRoom(videoId, message, excludeWs = null) {
  if (!rooms[videoId]) {
    console.log(`Attempted to broadcast to non-existent room: ${videoId}`);
    return;
  }

  console.log(`Broadcasting to room ${videoId}: ${message.type}`);

  const jsonMessage = JSON.stringify(message);
  let recipientCount = 0;

  Object.entries(rooms[videoId].users).forEach(([connId, user]) => {
    if (
      user.ws &&
      user.ws !== excludeWs &&
      user.ws.readyState === WebSocket.OPEN
    ) {
      try {
        user.ws.send(jsonMessage);
        recipientCount++;
      } catch (err) {
        console.error(`Failed to send to client ${connId}:`, err);
      }
    }
  });

  console.log(`Message broadcast to ${recipientCount} recipients`);
}

// Periodic cleanup of old rooms (every hour)
setInterval(() => {
  const now = new Date();
  for (const videoId in rooms) {
    // Remove rooms that are empty or older than 24 hours
    const roomAge = now - rooms[videoId].createdAt;
    if (
      Object.keys(rooms[videoId].users).length === 0 ||
      roomAge > 24 * 60 * 60 * 1000
    ) {
      console.log(
        `Cleaning up room ${videoId} (age: ${roomAge / 3600000} hours)`
      );
      delete rooms[videoId];
    }
  }
}, 3600000); // Every hour

// Heartbeat to keep connections alive
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
