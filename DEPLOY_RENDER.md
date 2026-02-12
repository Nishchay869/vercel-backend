# Deploy to Render - Step by Step

## Prerequisites

- GitHub account
- Render account (free tier works)
- MongoDB Atlas account (free tier)

---

## Step 1: Push Code to GitHub

```bash
cd /Users/nishchay/Desktop/church
git init
git add .
git commit -m "Initial commit - Church website"
# Create a new repository on GitHub and push:
git remote add origin https://github.com/YOUR_USERNAME/church-website.git
git push -u origin main
```

---

## Step 2: Prepare MongoDB Atlas

1. Go to https://cloud.mongodb.com
2. Create account and cluster (free tier)
3. Create database user:
   - Username: `church_admin`
   - Password: Generate auto or create custom
4. Add IP to whitelist:
   - Click "Network Access" → "Add IP Address"
   - Add: `0.0.0.0/0` (allows all IPs)
5. Get connection string:
   - Click "Database" → "Connect" → "Connect your application"
   - Copy the connection string

---

## Step 3: Deploy Backend to Render

1. Go to https://dashboard.render.com
2. Sign up/Login with GitHub
3. Click **"New"** → **"Web Service"**
4. Connect your GitHub repository
5. Configure:
   - **Name:** `church-backend`
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` (or $7/month for always-on)
6. **Add Environment Variables:**
   ```
   MONGODB_URI=mongodb+srv://church_admin:YOUR_PASSWORD@cluster0.xumtpuc.mongodb.net/church?retryWrites=true&w=majority
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=church123
   PORT=3001
   CORS_ORIGINS=https://your-church-frontend.vercel.app
   NODE_ENV=production
   ```
7. Click **"Create Web Service"**

---

## Step 4: Deploy Frontend to Vercel

1. Go to https://vercel.com
2. Sign up/Login with GitHub
3. Click **"Add New"** → **"Project"**
4. Import your GitHub repository
5. Configure:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
6. **Add Environment Variables:**
   ```
   VITE_API_URL=https://your-backend.onrender.com
   VITE_SOCKET_URL=https://your-backend.onrender.com
   ```
7. Click **"Deploy"**

---

## Step 5: Update CORS

After deployment, copy your Vercel frontend URL and add it to Render:

1. Go to Render dashboard → Your Web Service → **"Environment"**
2. Add:
   ```
   CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173
   ```
3. Redeploy or wait for automatic restart

---

## Step 6: Test

- **Backend Health:** https://your-backend.onrender.com/health
- **Frontend:** https://your-frontend.vercel.app

---

## Quick Commands

```bash
# Local development
cd backend && npm start

# Build frontend
cd frontend && npm run build

# Deploy changes
git add .
git commit -m "Your changes"
git push
```

---

## Troubleshooting

| Issue                 | Solution                                     |
| --------------------- | -------------------------------------------- |
| CORS Error            | Add frontend URL to `CORS_ORIGINS` in Render |
| MongoDB Connection    | Check IP whitelist in MongoDB Atlas          |
| Socket.io not working | Ensure CORS includes frontend URL            |
| Build fails           | Check Node.js version (v18+ recommended)     |

---

## Environment Variables Summary

**Backend (.env for local):**

```env
MONGODB_URI=mongodb+srv://church_admin:PASSWORD@cluster0.mongodb.net/church
ADMIN_USERNAME=admin
ADMIN_PASSWORD=church123
PORT=3001
CORS_ORIGINS=http://localhost:5173
```

**Frontend (.env for local):**

```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```
