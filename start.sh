#!/usr/bin/env bash
set -e

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║          TaskPilot Launcher            ║"
echo "  ║     Secure AI Agent Framework          ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js not found!"
    echo "  Install: https://nodejs.org/"
    echo ""
    exit 1
fi

echo "  Node.js: $(node --version)"

# Navigate to script directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "  Installing dependencies..."
    npm install
    echo "  Dependencies installed!"
    echo ""
fi

# Create data directory if needed
mkdir -p data

echo ""
echo "  Starting TaskPilot server..."
echo ""
echo "  ┌──────────────────────────────────────┐"
echo "  │  http://localhost:4242                │"
echo "  │  Press Ctrl+C to stop                │"
echo "  └──────────────────────────────────────┘"
echo ""

# Try to open browser (non-blocking)
if command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open "http://localhost:4242") &
elif command -v open &> /dev/null; then
    (sleep 2 && open "http://localhost:4242") &
fi

# Start the server
npx tsx web/server.ts
