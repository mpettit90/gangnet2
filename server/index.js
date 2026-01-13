const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Channel configuration
const channels = [
  { id: 'channel-1', name: 'Main', color: '#4CAF50' },
  { id: 'channel-2', name: 'Tactical', color: '#2196F3' },
  { id: 'channel-3', name: 'Command', color: '#FF9800' },
  { id: 'channel-4', name: 'Support', color: '#9C27B0' }
];

// Store connected users and their states
const users = new Map();

// API endpoint to get channel configuration
app.get('/api/channels', (req, res) => {
  res.json({ channels });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Initialize user
  const userId = uuidv4();
  users.set(socket.id, {
    id: userId,
    socketId: socket.id,
    channels: new Set(),
    transmitting: new Set()
  });

  // Send user their ID and available channels
  socket.emit('init', {
    userId,
    channels
  });

  // Notify others of new user
  socket.broadcast.emit('user-connected', { userId, socketId: socket.id });

  // Handle joining a channel for listening
  socket.on('join-channel', ({ channelId }) => {
    const user = users.get(socket.id);
    if (user) {
      user.channels.add(channelId);
      socket.join(channelId);
      console.log(`User ${userId} joined channel ${channelId}`);
      
      // Notify others in the channel
      socket.to(channelId).emit('user-joined-channel', {
        userId,
        socketId: socket.id,
        channelId
      });
    }
  });

  // Handle leaving a channel
  socket.on('leave-channel', ({ channelId }) => {
    const user = users.get(socket.id);
    if (user) {
      user.channels.delete(channelId);
      user.transmitting.delete(channelId);
      socket.leave(channelId);
      console.log(`User ${userId} left channel ${channelId}`);
      
      socket.to(channelId).emit('user-left-channel', {
        userId,
        socketId: socket.id,
        channelId
      });
    }
  });

  // WebRTC signaling: offer
  socket.on('webrtc-offer', ({ offer, targetSocketId, channelId }) => {
    console.log(`WebRTC offer from ${socket.id} to ${targetSocketId} on channel ${channelId}`);
    io.to(targetSocketId).emit('webrtc-offer', {
      offer,
      fromSocketId: socket.id,
      channelId
    });
  });

  // WebRTC signaling: answer
  socket.on('webrtc-answer', ({ answer, targetSocketId, channelId }) => {
    console.log(`WebRTC answer from ${socket.id} to ${targetSocketId} on channel ${channelId}`);
    io.to(targetSocketId).emit('webrtc-answer', {
      answer,
      fromSocketId: socket.id,
      channelId
    });
  });

  // WebRTC signaling: ICE candidate
  socket.on('webrtc-ice-candidate', ({ candidate, targetSocketId, channelId }) => {
    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      candidate,
      fromSocketId: socket.id,
      channelId
    });
  });

  // Handle transmit start (user starts speaking to a channel)
  socket.on('transmit-start', ({ channelId }) => {
    const user = users.get(socket.id);
    if (user) {
      user.transmitting.add(channelId);
      console.log(`User ${userId} started transmitting on channel ${channelId}`);
      
      // Notify all users in the channel
      socket.to(channelId).emit('user-transmitting', {
        userId,
        socketId: socket.id,
        channelId,
        transmitting: true
      });
    }
  });

  // Handle transmit stop
  socket.on('transmit-stop', ({ channelId }) => {
    const user = users.get(socket.id);
    if (user) {
      user.transmitting.delete(channelId);
      console.log(`User ${userId} stopped transmitting on channel ${channelId}`);
      
      socket.to(channelId).emit('user-transmitting', {
        userId,
        socketId: socket.id,
        channelId,
        transmitting: false
      });
    }
  });

  // Request list of users in a channel (for establishing peer connections)
  socket.on('request-channel-users', ({ channelId }) => {
    const channelUsers = [];
    users.forEach((user, socketId) => {
      if (user.channels.has(channelId) && socketId !== socket.id) {
        channelUsers.push({
          socketId,
          userId: user.id
        });
      }
    });
    
    socket.emit('channel-users', { channelId, users: channelUsers });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const user = users.get(socket.id);
    
    if (user) {
      // Notify all channels the user was in
      user.channels.forEach(channelId => {
        socket.to(channelId).emit('user-left-channel', {
          userId: user.id,
          socketId: socket.id,
          channelId
        });
      });
      
      users.delete(socket.id);
    }
    
    // Notify all users
    socket.broadcast.emit('user-disconnected', { socketId: socket.id });
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`GangNet2 server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to access the application`);
});
