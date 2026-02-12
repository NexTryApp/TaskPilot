#!/bin/bash
echo ""
echo "  TaskPilot — Docker"
echo "  Building and starting containers..."
echo ""
cd "$(dirname "$0")"
docker compose up --build
