#!/bin/bash

echo "======================================"
echo "Push MCP Weather Server to GitHub"
echo "======================================"
echo ""
echo "Repository: https://github.com/skaul10/mcp-weather-server"
echo ""
echo "This script will push your code to GitHub."
echo "You'll be prompted for your GitHub username and password."
echo ""
echo "IMPORTANT: Use a Personal Access Token as password, not your GitHub password!"
echo "Get token from: https://github.com/settings/tokens"
echo ""
read -p "Press Enter to continue..."

cd ~/temp-mcp-weather-server

# Make sure we're on main branch
git branch -M main

# Add all files
git add .

# Commit if needed
git diff-index --quiet HEAD || git commit -m "MCP Weather Server for Agentforce"

# Push to GitHub
echo ""
echo "Pushing to GitHub..."
echo "Enter your GitHub username when prompted: skaul10"
echo "Enter your Personal Access Token (not password) when prompted for password"
echo ""

git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! Code pushed to GitHub"
    echo "Repository: https://github.com/skaul10/mcp-weather-server"
    echo ""
    echo "Next: Go to Render and connect this repository"
else
    echo ""
    echo "❌ Push failed. Please check your credentials."
    echo ""
    echo "Need help? Create a Personal Access Token:"
    echo "1. Go to: https://github.com/settings/tokens"
    echo "2. Click 'Generate new token (classic)'"
    echo "3. Give it a name: 'Render Deploy'"
    echo "4. Check 'repo' scope"
    echo "5. Click 'Generate token'"
    echo "6. Copy the token and use it as password"
fi
