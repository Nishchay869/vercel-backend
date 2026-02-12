import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = createServer(app);

// Configure CORS for both Express and Socket.io
app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
  },
});

// ============================================
// IN-MEMORY DATABASES (Replace with real DB)
// ============================================

// Comments database
let comments = [];

// Prayer Requests database
let prayerRequests = [
  {
    id: 1,
    name: "Sarah M.",
    request: "Please pray for my brother's recovery from surgery. May God give him strength and healing.",
    isAnonymous: false,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Anonymous",
    request: "Praying for peace and guidance during this difficult season in our family.",
    isAnonymous: true,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: "Michael T.",
    request: "Please lift up our church leadership as they make important decisions for our community.",
    isAnonymous: false,
    status: "answered",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Admin credentials (demo - use secure storage in production)
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "church123",
};

// Simple token storage (use JWT in production)
let activeTokens = new Set();

// ============================================
// SOCKET.IO - COMMENTS SYSTEM
// ============================================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send existing comments to the newly connected client
  socket.emit("initial-comments", comments);

  // Listen for new comment events
  socket.on("new-comment", (comment) => {
    const newComment = {
      id: Date.now(),
      ...comment,
      timestamp: new Date().toISOString(),
    };

    // Add to comments array
    comments.push(newComment);

    // Broadcast to ALL connected clients (including sender)
    io.emit("new-comment", newComment);

    console.log(`New comment from ${comment.author}: ${comment.text}`);
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

// GET all prayer requests (protected)
app.get("/api/prayer-requests", authenticateToken, (req, res) => {
  const sortedRequests = [...prayerRequests].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(sortedRequests);
});

// GET single prayer request (protected)
app.get("/api/prayer-requests/:id", authenticateToken, (req, res) => {
  const request = prayerRequests.find((r) => r.id === parseInt(req.params.id));
  if (!request) {
    return res.status(404).json({ error: "Prayer request not found" });
  }
  res.json(request);
});

// POST new prayer request (public)
app.post("/api/prayer-requests", (req, res) => {
  const { name, request, isAnonymous } = req.body;

  if (!request) {
    return res.status(400).json({ error: "Prayer request text is required" });
  }

  const newRequest = {
    id: Date.now(),
    name: isAnonymous ? "Anonymous" : name || "Anonymous",
    request,
    isAnonymous: isAnonymous || false,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  prayerRequests.push(newRequest);

  // Notify connected admin clients via Socket.io
  io.emit("prayer-request-updated", { type: "added", request: newRequest });

  res.status(201).json(newRequest);
});

// PUT update prayer request (protected)
app.put("/api/prayer-requests/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, request, status, isAnonymous } = req.body;

  const index = prayerRequests.findIndex((r) => r.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Prayer request not found" });
  }

  const updatedRequest = {
    ...prayerRequests[index],
    name: name !== undefined ? name : prayerRequests[index].name,
    request: request !== undefined ? request : prayerRequests[index].request,
    status: status !== undefined ? status : prayerRequests[index].status,
    isAnonymous: isAnonymous !== undefined ? isAnonymous : prayerRequests[index].isAnonymous,
    updatedAt: new Date().toISOString(),
  };

  prayerRequests[index] = updatedRequest;

  // Notify connected clients
  io.emit("prayer-request-updated", { type: "updated", request: updatedRequest });

  res.json(updatedRequest);
});

// DELETE prayer request (protected)
app.delete("/api/prayer-requests/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id);
  const index = prayerRequests.findIndex((r) => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Prayer request not found" });
  }

  const deleted = prayerRequests.splice(index, 1)[0];

  // Notify connected clients
  io.emit("prayer-request-updated", { type: "deleted", requestId: id });

  res.json({ success: true, message: "Prayer request deleted", request: deleted });
});

// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    connectedClients: io.engine.clientsCount,
    prayerRequestsCount: prayerRequests.length
  });
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server ready for connections`);
  console.log(`Admin login: username=admin, password=church123`);
});

