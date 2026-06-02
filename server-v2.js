#!/usr/bin/env node

/**
 * Simple MCP Weather Server for Agentforce POC - v2
 * More robust error handling and logging
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Helper to fetch JSON from HTTPS endpoint
function fetchJson(urlString) {
  return new Promise((resolve, reject) => {
    https.get(urlString, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}. Raw data: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`HTTP request failed: ${err.message}`));
    });
  });
}

// Map WMO weather codes to descriptions
function getWeatherDescription(code) {
  const weatherCodes = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
  };
  return weatherCodes[code] || `Unknown (code: ${code})`;
}

// Fetch weather data from Open-Meteo API
async function getWeather(city, countryCode) {
  console.log(`[${new Date().toISOString()}] getWeather called with city="${city}", country_code="${countryCode}"`);

  try {
    // Step 1: Geocode the city name
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    console.log(`[Geocoding] ${geocodeUrl}`);

    const geoData = await fetchJson(geocodeUrl);
    console.log(`[Geocoding] Response:`, JSON.stringify(geoData).substring(0, 300));

    if (!geoData || !geoData.results || geoData.results.length === 0) {
      const msg = `Unable to find location: ${city}`;
      console.log(`[Geocoding] ${msg}`);
      return {
        content: [{ type: 'text', text: msg }]
      };
    }

    const location = geoData.results[0];
    const { latitude, longitude, name, country } = location;
    console.log(`[Geocoding] Found: ${name}, ${country} (${latitude}, ${longitude})`);

    // Step 2: Fetch weather data
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
    console.log(`[Weather] ${weatherUrl}`);

    const weatherData = await fetchJson(weatherUrl);
    console.log(`[Weather] Response keys:`, Object.keys(weatherData || {}));
    console.log(`[Weather] Full response:`, JSON.stringify(weatherData).substring(0, 500));

    if (!weatherData) {
      throw new Error('Weather API returned null/undefined');
    }

    if (!weatherData.current) {
      throw new Error(`Weather API response missing 'current' property. Keys present: ${Object.keys(weatherData).join(', ')}`);
    }

    const current = weatherData.current;
    console.log(`[Weather] Current data:`, JSON.stringify(current));

    const weatherDesc = getWeatherDescription(current.weather_code);

    const result = {
      location: `${name}, ${country}`,
      temperature: current.temperature_2m || 0,
      feels_like: current.apparent_temperature || 0,
      conditions: weatherDesc,
      humidity: current.relative_humidity_2m || 0,
      wind_speed: current.wind_speed_10m || 0,
      precipitation: current.precipitation || 0,
      units: {
        temperature: 'Fahrenheit',
        wind_speed: 'mph',
        precipitation: 'inches'
      }
    };

    console.log(`[Success] Returning:`, JSON.stringify(result));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    const errorMsg = `Error fetching weather: ${error.message}`;
    console.error(`[Error] ${errorMsg}`);
    console.error(`[Error] Stack:`, error.stack);
    return {
      content: [{
        type: 'text',
        text: errorMsg
      }],
      isError: true
    };
  }
}

// MCP Protocol handlers
const mcpHandlers = {
  'initialize': async (params) => {
    console.log('[MCP] initialize called');
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'weather-mcp-server', version: '2.0.0' }
    };
  },

  'tools/list': async () => {
    console.log('[MCP] tools/list called');
    return {
      tools: [{
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
      }]
    };
  },

  'tools/call': async (params) => {
    console.log('[MCP] tools/call called with params:', JSON.stringify(params));
    const { name, arguments: args } = params;

    if (name === 'get_weather') {
      return await getWeather(args.city, args.country_code || 'US');
    }

    throw new Error(`Unknown tool: ${name}`);
  }
};

// HTTP Server
const server = http.createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.headers['user-agent'] || 'unknown'}`);

  // CORS headers
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
      version: '2.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // MCP endpoint
  if (path === '/mcp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        console.log('[MCP] Request body:', body);
        const request = JSON.parse(body);
        const { method, params } = request;

        if (!mcpHandlers[method]) {
          console.error(`[MCP] Unknown method: ${method}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown method: ${method}` }));
          return;
        }

        const result = await mcpHandlers[method](params || {});
        console.log('[MCP] Handler result:', JSON.stringify(result).substring(0, 200));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id || null,
          result
        }));
      } catch (error) {
        console.error('[MCP] Error:', error);
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
  console.log(`\n🌤️  MCP Weather Server v2.0 running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp\n`);
});
