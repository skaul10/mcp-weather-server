#!/usr/bin/env node

/**
 * Simple MCP Weather Server for Agentforce POC
 * Implements Model Context Protocol (MCP) over HTTP/SSE
 * Provides weather data via Open-Meteo API (no API key required)
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

// MCP Protocol handlers
const mcpHandlers = {
  'initialize': async (params) => {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'weather-mcp-server',
        version: '1.0.0'
      }
    };
  },

  'tools/list': async () => {
    return {
      tools: [
        {
          name: 'get_weather',
          description: 'Get current weather for a city',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name (e.g., "San Francisco")'
              },
              country_code: {
                type: 'string',
                description: 'Two-letter country code (e.g., "US")',
                default: 'US'
              }
            },
            required: ['city']
          }
        }
      ]
    };
  },

  'tools/call': async (params) => {
    const { name, arguments: args } = params;

    if (name === 'get_weather') {
      return await getWeather(args.city, args.country_code || 'US');
    }

    throw new Error(`Unknown tool: ${name}`);
  }
};

// Fetch weather data from Open-Meteo API
async function getWeather(city, countryCode) {
  try {
    // First, geocode the city name
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const geoData = await fetchJson(geocodeUrl);

    if (!geoData.results || geoData.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Unable to find location: ${city}`
          }
        ]
      };
    }

    const location = geoData.results[0];
    const { latitude, longitude, name, country } = location;

    // Fetch weather data
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
    console.log(`Fetching weather from: ${weatherUrl}`);
    const weatherData = await fetchJson(weatherUrl);
    console.log(`Weather data received:`, JSON.stringify(weatherData).substring(0, 200));

    if (!weatherData.current) {
      throw new Error(`Invalid weather data structure - missing 'current' property`);
    }

    const current = weatherData.current;
    const weatherDesc = getWeatherDescription(current.weather_code);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            location: `${name}, ${country}`,
            temperature: current.temperature_2m,
            feels_like: current.apparent_temperature,
            conditions: weatherDesc,
            humidity: current.relative_humidity_2m,
            wind_speed: current.wind_speed_10m,
            precipitation: current.precipitation,
            units: {
              temperature: 'Fahrenheit',
              wind_speed: 'mph',
              precipitation: 'inches'
            }
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching weather: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

// Helper to fetch JSON from HTTPS endpoint
function fetchJson(urlString) {
  return new Promise((resolve, reject) => {
    https.get(urlString, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Map WMO weather codes to descriptions
function getWeatherDescription(code) {
  const weatherCodes = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  return weatherCodes[code] || 'Unknown';
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Log all incoming requests
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.headers['user-agent'] || 'unknown'}`);

  // CORS headers - more permissive for Salesforce
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  // Health check
  if (path === '/health' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'MCP Weather Server',
      mcp_version: '1.0'
    }));
    return;
  }

  // MCP endpoint - Streamable HTTP format for Agentforce
  if (path === '/mcp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        const { method, params } = request;

        if (!mcpHandlers[method]) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `Unknown method: ${method}`
          }));
          return;
        }

        const result = await mcpHandlers[method](params || {});

        // Return as single JSON object (Streamable HTTP format for Agentforce)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id || null,
          result
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: error.message
          }
        }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🌤️  MCP Weather Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`\nAvailable tools:`);
  console.log(`  - get_weather: Get current weather for any city`);
});
