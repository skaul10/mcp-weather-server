# MCP Weather Server for Agentforce POC

A simple Model Context Protocol (MCP) server that provides weather data for testing Agentforce MCP integration.

## Features

- Implements MCP protocol over HTTP/JSON-RPC
- Provides `get_weather` tool
- Uses Open-Meteo API (no API key required)
- Returns current temperature, conditions, humidity, wind speed

## Quick Start

### Local Testing

```bash
# Start the server
node server.js

# Test health endpoint
curl http://localhost:3000/health

# Test weather tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Get weather for a city
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_weather",
      "arguments": {
        "city": "San Francisco",
        "country_code": "US"
      }
    }
  }'
```

### Make Publicly Accessible

For Salesforce to connect, the server needs to be publicly accessible. Options:

1. **ngrok** (easiest for testing):
   ```bash
   # Install ngrok: https://ngrok.com/download
   ngrok http 3000
   # Use the https URL provided by ngrok
   ```

2. **Deploy to Railway**:
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   # Login and deploy
   railway login
   railway init
   railway up
   ```

3. **Deploy to Render** (free tier):
   - Push to GitHub
   - Connect to Render.com
   - Deploy as web service

## MCP Tool Schema

### get_weather

**Inputs:**
- `city` (string, required): City name (e.g., "San Francisco")
- `country_code` (string, optional): Two-letter country code (default: "US")

**Outputs (JSON):**
```json
{
  "location": "San Francisco, United States",
  "temperature": 62.5,
  "feels_like": 60.2,
  "conditions": "Partly cloudy",
  "humidity": 75,
  "wind_speed": 8.5,
  "precipitation": 0,
  "units": {
    "temperature": "Fahrenheit",
    "wind_speed": "mph",
    "precipitation": "inches"
  }
}
```

## Usage with Agentforce

1. Deploy this server to get a public URL
2. Create `McpServerDefinition` in Salesforce pointing to `https://your-server.com/mcp`
3. Reference in Agent Script: `target: "mcpTool://get_weather"`
