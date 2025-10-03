const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database
let users = [
  {
    id: '1',
    email: 'islamsyedmahin@gmail.com',
    password: '$2a$10$8Vz5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B5B',
    username: '@Mahin',
    name: 'Syed Mahin',
    isVerified: true,
    isAdmin: true,
    avatar: '',
    joinedDate: new Date()
  }
];
let posts = [];
let messages = [];
let verificationCodes = {};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin API
app.get('/admin/users', (req, res) => {
  const usersWithoutPasswords = users.map(user => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });
  res.json(usersWithoutPasswords);
});

// Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Register user
  socket.on('register', async (userData) => {
    const { email, password, username, name } = userData;
    
    // Check if email or username exists
    if (users.find(u => u.email === email)) {
      socket.emit('register_error', 'Email already exists');
      return;
    }
    if (users.find(u => u.username === username)) {
      socket.emit('register_error', 'Username already taken');
      return;
    }

    // Generate verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[email] = { code, userData, timestamp: Date.now() };
    
    socket.emit('verification_sent', { email, code });
  });

  // Verify email
  socket.on('verify_email', (data) => {
    const { email, code } = data;
    const verification = verificationCodes[email];
    
    if (verification && verification.code === code) {
      const hashedPassword = bcrypt.hashSync(verification.userData.password, 10);
      const newUser = {
        id: Date.now().toString(),
        ...verification.userData,
        password: hashedPassword,
        isVerified: true,
        isAdmin: false,
        avatar: '',
        joinedDate: new Date()
      };
      
      users.push(newUser);
      delete verificationCodes[email];
      
      socket.emit('verification_success', newUser);
      io.emit('new_user_registered', newUser);
    } else {
      socket.emit('verification_error', 'Invalid verification code');
    }
  });

  // Login
  socket.on('login', (credentials) => {
    const { email, password } = credentials;
    const user = users.find(u => u.email === email);
    
    if (user && bcrypt.compareSync(password, user.password)) {
      socket.user = user;
      socket.emit('login_success', user);
      io.emit('user_online', user);
    } else {
      socket.emit('login_error', 'Invalid email or password');
    }
  });

  // Create post
  socket.on('create_post', (postData) => {
    const post = {
      id: Date.now().toString(),
      ...postData,
      likes: [],
      comments: [],
      timestamp: new Date()
    };
    posts.unshift(post);
    io.emit('new_post', post);
  });

  // Like post
  socket.on('like_post', (data) => {
    const post = posts.find(p => p.id === data.postId);
    if (post) {
      const likeIndex = post.likes.findIndex(like => like.userId === data.userId);
      if (likeIndex > -1) {
        post.likes.splice(likeIndex, 1);
      } else {
        post.likes.push({ userId: data.userId, username: data.username });
      }
      io.emit('post_updated', post);
    }
  });

  // Add comment
  socket.on('add_comment', (data) => {
    const post = posts.find(p => p.id === data.postId);
    if (post) {
      const comment = {
        id: Date.now().toString(),
        ...data,
        timestamp: new Date()
      };
      post.comments.push(comment);
      io.emit('post_updated', post);
    }
  });

  // Upload avatar
  socket.on('upload_avatar', (data) => {
    const user = users.find(u => u.id === data.userId);
    if (user) {
      user.avatar = data.avatarUrl;
      io.emit('user_updated', user);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Linkora Server running on port ${PORT}`);
});
