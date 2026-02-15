import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Comment from "./models/Comment.js";
import PrayerRequest from "./models/PrayerRequest.js";
import path from "path";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// const _dirname = path.resolve();

// Get allowed origins from environment or use defaults
const getCorsOrigins = () => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
  }
  // Production: allow the deployed frontend
  if (process.env.NODE_ENV === 'production') {
    return ["https://vercel-frontend-eosin-five.vercel.app"];
  }
  // Development
  return ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"];
};

// Configure CORS for both Express and Socket.io
// Allow all origins for development
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());


const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// ============================================
// IN-MEMORY STORAGE (fallback when MongoDB unavailable)
// ============================================

let inMemoryComments = [];
let inMemoryPrayerRequests = [];
let isMongoConnected = false;

// ============================================
// MONGODB CONNECTION
// ============================================

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || "mongodb+srv://gowdanishchay294_db_user:Nishchay%402005@cluster0.xumtpuc.mongodb.net/?appName=Cluster0";
    // MongoDB Atlas connection options
    const options = {
      // For MongoDB Atlas (cloud)
      ...(mongoURI.includes('mongodb+srv') && {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }),
      // For local development
      ...(mongoURI.includes('localhost') && {
        serverSelectionTimeoutMS: 5000,
      }),
    };

    await mongoose.connect(mongoURI, options);
    isMongoConnected = true;
    console.log("MongoDB connected successfully");
    
    // Log connection info
    if (mongoURI.includes('mongodb+srv')) {
      console.log("Using MongoDB Atlas (cloud)");
    } else {
      console.log("Using local MongoDB");
    }
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    console.log("Continuing without MongoDB - using in-memory fallback");
    isMongoConnected = false;
  }
};

// Initialize data from in-memory to MongoDB
const initializeData = async () => {
  if (!isMongoConnected) {
    console.log("Running without MongoDB - using in-memory storage only");
    return;
  }
  
  try {
    // Check if comments collection is empty
    const commentsCount = await Comment.countDocuments();
    if (commentsCount === 0) {
      console.log("Initializing sample data...");
    }
  } catch (error) {
    console.log("Could not initialize data:", error.message);
  }
};

// ============================================
// ADMIN CREDENTIALS (from environment variables)
// ============================================

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "church123",
};

// Simple token storage (use JWT in production)
let activeTokens = new Set();

// ============================================
// SOCKET.IO - COMMENTS SYSTEM
// ============================================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Load comments from MongoDB or in-memory storage
  const loadComments = async () => {
    try {
      if (isMongoConnected) {
        const comments = await Comment.find().sort({ timestamp: -1 }).limit(50);
        // Convert to plain objects with string id for frontend compatibility
        return comments.map(comment => ({
          id: comment._id.toString(),
          _id: comment._id.toString(),
          author: comment.author,
          text: comment.text,
          timestamp: comment.timestamp,
        }));
      } else {
        // Return in-memory comments sorted by timestamp
        return inMemoryComments
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 50)
          .map((comment, index) => ({
            id: comment.id || `temp-${index}`,
            _id: comment.id || `temp-${index}`,
            author: comment.author,
            text: comment.text,
            timestamp: comment.timestamp,
          }));
      }
    } catch (error) {
      console.error("Error loading comments:", error);
      return [];
    }
  };

  // Send existing comments to the newly connected client
  loadComments().then((comments) => {
    socket.emit("initial-comments", comments);
  });

  // Listen for new comment events
  socket.on("new-comment", async (comment) => {
    try {
      const timestamp = new Date();
      
      if (isMongoConnected) {
        const newComment = new Comment({
          author: comment.author || "Anonymous",
          text: comment.text,
          timestamp,
        });

        await newComment.save();

        // Broadcast to ALL connected clients (including sender)
        // Use string representation of _id for compatibility
        io.emit("new-comment", {
          id: newComment._id.toString(),
          _id: newComment._id.toString(),
          author: newComment.author,
          text: newComment.text,
          timestamp: newComment.timestamp,
        });
      } else {
        // Store in memory
        const tempId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newComment = {
          id: tempId,
          author: comment.author || "Anonymous",
          text: comment.text,
          timestamp,
        };
        
        inMemoryComments.push(newComment);
        
        // Broadcast to all clients
        io.emit("new-comment", {
          id: tempId,
          _id: tempId,
          author: newComment.author,
          text: newComment.text,
          timestamp: newComment.timestamp,
        });
      }

      console.log(`New comment from ${comment.author || "Anonymous"}: ${comment.text}`);
    } catch (error) {
      console.error("Error saving comment:", error);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  if (!activeTokens.has(token)) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  next();
};

// ============================================
// AUTH ROUTES
// ============================================

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    // Generate simple token (use JWT in production)
    const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    activeTokens.add(token);

    res.json({
      success: true,
      token,
      user: { username: ADMIN_CREDENTIALS.username, role: "admin" },
    });
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials" });
  }
});

app.post("/api/logout", authenticateToken, (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  activeTokens.delete(token);
  res.json({ success: true, message: "Logged out successfully" });
});

// ============================================
// PRAYER REQUESTS ROUTES
// ============================================

// Helper function to format prayer request with id field for frontend
const formatPrayerRequest = (pr) => ({
  id: pr._id?.toString() || pr.id,
  _id: pr._id?.toString() || pr.id,
  name: pr.name,
  request: pr.request,
  isAnonymous: pr.isAnonymous,
  status: pr.status,
  createdAt: pr.createdAt,
  updatedAt: pr.updatedAt,
});

// GET all prayer requests (protected)
app.get("/api/prayer-requests", authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected) {
      const requests = await PrayerRequest.find().sort({ createdAt: -1 });
      res.json(requests.map(formatPrayerRequest));
    } else {
      // Return in-memory prayer requests sorted by date
      const requests = inMemoryPrayerRequests
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(formatPrayerRequest);
      res.json(requests);
    }
  } catch (error) {
    console.error("Error fetching prayer requests:", error);
    res.status(500).json({ error: "Failed to fetch prayer requests" });
  }
});

// GET single prayer request (protected)
app.get("/api/prayer-requests/:id", authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected) {
      const request = await PrayerRequest.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Prayer request not found" });
      }
      res.json(formatPrayerRequest(request));
    } else {
      // Search in-memory
      const request = inMemoryPrayerRequests.find(
        (pr) => pr.id === req.params.id || pr._id === req.params.id
      );
      if (!request) {
        return res.status(404).json({ error: "Prayer request not found" });
      }
      res.json(formatPrayerRequest(request));
    }
  } catch (error) {
    console.error("Error fetching prayer request:", error);
    res.status(500).json({ error: "Failed to fetch prayer request" });
  }
});

// POST new prayer request (public)
app.post("/api/prayer-requests", async (req, res) => {
  try {
    const { name, request, isAnonymous } = req.body;

    if (!request) {
      return res.status(400).json({ error: "Prayer request text is required" });
    }

    const createdAt = new Date();
    const updatedAt = new Date();

    if (isMongoConnected) {
      const newRequest = new PrayerRequest({
        name: isAnonymous ? "Anonymous" : name || "Anonymous",
        request,
        isAnonymous: isAnonymous || false,
        status: "pending",
        createdAt,
        updatedAt,
      });

      await newRequest.save();

      // Notify connected admin clients via Socket.io
      io.emit("prayer-request-updated", { type: "added", request: formatPrayerRequest(newRequest) });

      res.status(201).json(formatPrayerRequest(newRequest));
    } else {
      // Store in memory
      const tempId = `pr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newRequest = {
        _id: tempId,
        id: tempId,
        name: isAnonymous ? "Anonymous" : name || "Anonymous",
        request,
        isAnonymous: isAnonymous || false,
        status: "pending",
        createdAt,
        updatedAt,
      };

      inMemoryPrayerRequests.push(newRequest);

      // Notify connected clients via Socket.io
      io.emit("prayer-request-updated", { type: "added", request: formatPrayerRequest(newRequest) });

      res.status(201).json(formatPrayerRequest(newRequest));
    }
  } catch (error) {
    console.error("Error creating prayer request:", error);
    res.status(500).json({ error: "Failed to create prayer request" });
  }
});

// PUT update prayer request (protected)
app.put("/api/prayer-requests/:id", authenticateToken, async (req, res) => {
  try {
    const { name, request, status, isAnonymous } = req.body;

    if (isMongoConnected) {
      const updatedRequest = await PrayerRequest.findByIdAndUpdate(
        req.params.id,
        {
          name,
          request,
          status,
          isAnonymous,
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!updatedRequest) {
        return res.status(404).json({ error: "Prayer request not found" });
      }

      // Notify connected clients
      io.emit("prayer-request-updated", { type: "updated", request: formatPrayerRequest(updatedRequest) });

      res.json(formatPrayerRequest(updatedRequest));
    } else {
      // Update in memory
      const index = inMemoryPrayerRequests.findIndex(
        (pr) => pr.id === req.params.id || pr._id === req.params.id
      );

      if (index === -1) {
        return res.status(404).json({ error: "Prayer request not found" });
      }

      inMemoryPrayerRequests[index] = {
        ...inMemoryPrayerRequests[index],
        name: name || inMemoryPrayerRequests[index].name,
        request: request || inMemoryPrayerRequests[index].request,
        status: status || inMemoryPrayerRequests[index].status,
        isAnonymous: isAnonymous !== undefined ? isAnonymous : inMemoryPrayerRequests[index].isAnonymous,
        updatedAt: new Date(),
      };

      // Notify connected clients
      io.emit("prayer-request-updated", { type: "updated", request: formatPrayerRequest(inMemoryPrayerRequests[index]) });

      res.json(formatPrayerRequest(inMemoryPrayerRequests[index]));
    }
  } catch (error) {
    console.error("Error updating prayer request:", error);
    res.status(500).json({ error: "Failed to update prayer request" });
  }
});

// DELETE prayer request (protected)
app.delete("/api/prayer-requests/:id", authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected) {
      const deleted = await PrayerRequest.findByIdAndDelete(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: "Prayer request not found" });
      }

      // Notify connected clients
      io.emit("prayer-request-updated", { type: "deleted", requestId: req.params.id });

      res.json({ success: true, message: "Prayer request deleted", request: formatPrayerRequest(deleted) });
    } else {
      // Delete from memory
      const index = inMemoryPrayerRequests.findIndex(
        (pr) => pr.id === req.params.id || pr._id === req.params.id
      );

      if (index === -1) {
        return res.status(404).json({ error: "Prayer request not found" });
      }

      const deleted = inMemoryPrayerRequests[index];
      inMemoryPrayerRequests.splice(index, 1);

      // Notify connected clients
      io.emit("prayer-request-updated", { type: "deleted", requestId: req.params.id });

      res.json({ success: true, message: "Prayer request deleted", request: formatPrayerRequest(deleted) });
    }
  } catch (error) {
    console.error("Error deleting prayer request:", error);
    res.status(500).json({ error: "Failed to delete prayer request" });
  }
});

// DELETE all prayer requests (protected)
app.delete("/api/prayer-requests", authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected) {
      await PrayerRequest.deleteMany({});
      res.json({ success: true, message: "All prayer requests deleted" });
    } else {
      // Clear all in-memory prayer requests
      const count = inMemoryPrayerRequests.length;
      inMemoryPrayerRequests = [];
      
      // Notify connected clients
      io.emit("prayer-request-updated", { type: "deleted-all" });
      
      res.json({ success: true, message: `${count} prayer requests deleted` });
    }
  } catch (error) {
    console.error("Error deleting all prayer requests:", error);
    res.status(500).json({ error: "Failed to delete all prayer requests" });
  }
});

// ============================================
// COMMENTS ROUTES (for admin to manage)
// ============================================

// GET all comments (protected)
app.get("/api/comments", authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected) {
      const comments = await Comment.find().sort({ timestamp: -1 });
      res.json(comments);
    } else {
      // Return in-memory comments sorted by timestamp
      const comments = inMemoryComments
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map((comment, index) => ({
          ...comment,
          _id: comment._id || comment.id || `temp-${index}`,
        }));
      res.json(comments);
    }
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// DELETE comment (protected)
app.delete("/api/comments/:id", authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected) {
      const deleted = await Comment.findByIdAndDelete(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: "Comment not found" });
      }

      res.json({ success: true, message: "Comment deleted" });
    } else {
      // Delete from memory
      const index = inMemoryComments.findIndex(
        (c) => c.id === req.params.id || c._id === req.params.id
      );

      if (index === -1) {
        return res.status(404).json({ error: "Comment not found" });
      }

      inMemoryComments.splice(index, 1);
      res.json({ success: true, message: "Comment deleted" });
    }
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// ============================================
// STATIC FILES - Serve frontend in production
// ============================================

// Get __dirname equivalent for ES modules
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from frontend/dist if it exists
const frontendDistPath = path.join(__dirname, '../frontend/dist');
import { existsSync } from 'fs';

if (existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  console.log('Serving static files from:', frontendDistPath);
  
  // Catch-all route for SPA - serve index.html for unknown routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.log('Frontend dist not found at:', frontendDistPath);
  console.log('Run "cd frontend && npm run build" to create the dist folder');
}

// ============================================
// CATCH-ALL ROUTE FOR SPA
// ============================================
// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({ 
      status: "ok", 
      mongodb: mongoStatus,
      connectedClients: io.engine.clientsCount,
    });
  } catch (error) {
    res.json({ 
      status: "ok", 
      mongodb: "unknown",
      connectedClients: io.engine.clientsCount,
    });
  }
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3001;

// Connect to MongoDB first, then start server
connectDB().then(() => {
  initializeData();
  
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.io server ready for connections`);
    console.log(`Admin login: username=${ADMIN_CREDENTIALS.username}, password=${ADMIN_CREDENTIALS.password}`);
    console.log(`MongoDB URI: ${process.env.MONGODB_URI || "mongodb://localhost:27017/church-website"}`);
  });
});

export default app;
