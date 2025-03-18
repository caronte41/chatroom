const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Filter = require("bad-words");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const filter = new Filter();

// Store active rooms (video IDs) and their users
const rooms = {};

// Simple rate limiting
const rateLimits = {};

// Basic health check endpoint
app.get("/", (req, res) => {
  res.send("YouTube Anonymous Chat server is running");
});

io.on("connection", (socket) => {
  const videoId = socket.handshake.query.videoId;
  const nickname = socket.handshake.query.nickname;

  // Validate inputs
  if (
    !videoId ||
    !nickname ||
    typeof videoId !== "string" ||
    typeof nickname !== "string"
  ) {
    socket.disconnect();
    return;
  }

  // Join the room for this video
  socket.join(videoId);

  // Initialize room if it doesn't exist
  if (!rooms[videoId]) {
    rooms[videoId] = {
      users: {},
      messageCount: 0,
      createdAt: new Date(),
    };
  }

  // Add user to the room
  rooms[videoId].users[socket.id] = {
    nickname,
    joinTime: new Date(),
    messageCount: 0,
  };

  // Initialize rate limit tracking
  rateLimits[socket.id] = {
    lastMessageTime: Date.now(),
    messageCount: 0,
    resetTime: Date.now() + 60000, // 1 minute window
  };

  // Broadcast that a user joined
  socket.to(videoId).emit("user-joined", { nickname });

  // Let the user know how many people are in the room
  const userCount = Object.keys(rooms[videoId].users).length;
  socket.emit("chat-message", {
    nickname: "System",
    message: `${userCount} ${
      userCount === 1 ? "person is" : "people are"
    } watching this video`,
  });

  // Handle chat messages
  socket.on("chat-message", (data) => {
    // Rate limiting
    const now = Date.now();
    const rateLimit = rateLimits[socket.id];

    // Reset rate limit counter if window expired
    if (now > rateLimit.resetTime) {
      rateLimit.messageCount = 0;
      rateLimit.resetTime = now + 60000; // 1 minute window
    }

    // Check if user is sending too many messages
    if (rateLimit.messageCount >= 10) {
      // 10 messages per minute
      socket.emit("chat-message", {
        nickname: "System",
        message: "You are sending messages too quickly. Please wait a moment.",
      });
      return;
    }

    // Update rate limit counter
    rateLimit.messageCount++;
    rateLimit.lastMessageTime = now;

    // Server-side message moderation
    if (data.message && typeof data.message === "string") {
      try {
        // Prevent extremely long messages
        if (data.message.length > 200) {
          data.message = data.message.substring(0, 200) + "...";
        }

        // Filter profanity
        const cleanMessage = filter.clean(data.message);

        // Update user and room message counts
        rooms[videoId].users[socket.id].messageCount++;
        rooms[videoId].messageCount++;

        // Emit to all clients in the room
        io.to(videoId).emit("chat-message", {
          nickname: data.nickname,
          message: cleanMessage,
        });
      } catch (error) {
        console.error("Error processing message:", error);
      }
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (rooms[videoId] && rooms[videoId].users[socket.id]) {
      // Let others know user left
      socket.to(videoId).emit("user-left", {
        nickname: rooms[videoId].users[socket.id].nickname,
      });

      // Remove user from room
      delete rooms[videoId].users[socket.id];

      // Clean up rate limit data
      delete rateLimits[socket.id];

      // Clean up empty rooms
      if (Object.keys(rooms[videoId].users).length === 0) {
        delete rooms[videoId];
      }
    }
  });
});

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
      delete rooms[videoId];
    }
  }
}, 3600000); // Every hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
