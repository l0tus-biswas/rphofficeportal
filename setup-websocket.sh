#!/bin/bash

# WebSocket Implementation Setup Guide
# This script installs the required dependencies for real-time broadcast notifications

echo "🚀 Setting up WebSocket support for real-time broadcasts..."

# Backend Setup
echo ""
echo "📦 Installing backend dependencies..."
cd backend
npm install socket.io

if [ $? -ne 0 ]; then
  echo "❌ Failed to install socket.io"
  exit 1
fi

echo "✅ Backend dependencies installed"

# Frontend Setup
echo ""
echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install socket.io-client

if [ $? -ne 0 ]; then
  echo "❌ Failed to install socket.io-client"
  exit 1
fi

echo "✅ Frontend dependencies installed"

echo ""
echo "🎉 WebSocket setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify .env has APP_URL set correctly for CORS"
echo "2. Start backend: cd backend && npm start"
echo "3. Start frontend: cd frontend && npm start"
echo "4. Test by opening app in multiple tabs and sending a broadcast"
