/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, __dirname, process */
// dev-server.js — local API shim for /api endpoints used by the frontend
// Loads .env.local if present and starts an Express server that delegates
// requests to handlers in the `api/` folder.

// Load local env vars from project root .env.local for local dev
try {
  const path = require('path');
  const fs = require('fs');
  const dotenvPath = path.resolve(__dirname, '.env.local');
  if (fs.existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
    console.log(`[dev] dev-server loaded .env.local from ${dotenvPath}`);
  } else {
    require('dotenv').config();
    console.log('[dev] dev-server did not find .env.local at', dotenvPath);
  }
} catch (e) {
  // ignore
  void e;
}

const express = require('express');
const handler = require('./api/ai');

// debug: show whether key is present (never print the key)
try { console.log('[dev] dev-server OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY); } catch (e) { void e; }

const app = express();
app.use(express.json({ limit: '1mb' }));

app.options('/api/ai', (req, res) => res.sendStatus(204));

app.post('/api/ai', async (req, res) => {
  try {
    // api/ai exports a handler(req, res) compatible function
    await handler(req, res);
  } catch (err) {
    console.error('Dev API handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Dev API listening on http://localhost:${port}`);
});
