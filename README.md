# Uno Multiplayer Game

A real-time multiplayer Uno game built with Node.js, Express, Socket.IO, and a Vanilla JS + Vite frontend.

🎮 **Live Demo:** [https://uno-game-blond.vercel.app/](https://uno-game-blond.vercel.app/)

## Deployment Guide

This project is separated into a `client` (frontend) and `server` (backend). Because the backend relies on persistent WebSocket connections to keep game states in memory, it cannot be fully hosted on Vercel's serverless functions. 

The recommended deployment architecture is:
- **Frontend**: Vercel
- **Backend**: Render, Railway, or Fly.io

### Deploying the Frontend (Vercel)

The `client` directory is fully configured for Vercel.

1. Create a new project in Vercel and import this repository.
2. In the Vercel project configuration, set the **Root Directory** to `client`.
3. Set the **Framework Preset** to `Vite` (Vercel should automatically detect this).
4. Add the following **Environment Variable**:
   - `VITE_SERVER_URL`: The URL of your deployed backend (e.g., `https://my-uno-backend.onrender.com`).
5. Deploy!

### Deploying the Backend (Render/Railway)

1. Create a new Web Service on Render or Railway.
2. Connect this repository and set the **Root Directory** to `server`.
3. The start command is `node index.js`.
4. Once deployed, take the provided URL and add it as the `VITE_SERVER_URL` in your Vercel frontend settings.

## Local Development

1. Start Backend:
   ```bash
   cd server
   npm install
   npm start
   ```

2. Start Frontend:
   ```bash
   cd client
   npm install
   npm run dev
   ```
