/**
 * Vercel Serverless Function: AI Dream Analysis via OpenAI
 *
 * Endpoint: POST /api/ai
 * Body: { dreamText: string, userId?: string }
 *
 * Environment variable required:
 *   OPENAI_API_KEY - Your OpenAI API key
 *
 * Uses gpt-4o-mini (cheapest, fast, reliable) by default.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const applyCors = (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
};

// ---------------------------------------------------------------------------
// Caching & rate limiting (in-memory, resets on cold start)
// ---------------------------------------------------------------------------
const resultCache = new Map();
const userLimits = new Map();

const DAILY_LIMIT = 10;
const MAX_INPUT_LENGTH = 4000;

const hashText = (text) => crypto.createHash('sha256').update(text).digest('hex');
const todayString = () => new Date().toISOString().slice(0, 10);

const checkRateLimit = (userId) => {
  if (!userId) return true;
  const today = todayString();
  const record = userLimits.get(userId);
  if (!record || record.date !== today) {
    userLimits.set(userId, { date: today, count: 1 });
    return true;
  }
  if (record.count >= DAILY_LIMIT) return false;
  record.count += 1;
  return true;
};

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------
const fallbackTitle = (text) => {
  const words = (text || '').trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
  if (!words.length) return 'Untitled Dream';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const fallbackThemes = () => 'Unable to generate themes at this time. Try again later.';

// ---------------------------------------------------------------------------
// OpenAI call
// ---------------------------------------------------------------------------
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const callOpenAI = async (dreamText, apiKey) => {
  const systemPrompt = `You are a reflective dream interpreter. Given a dream description, return ONLY valid minified JSON with no markdown or extra text. Schema: {"title":"2-4 evocative words","themes":"1 short paragraph using tentative language like might, could, seems"}`;

  const userPrompt = `Dream:\n"""${dreamText}"""`;

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 200,
    temperature: 0.7
  };

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  return content;
};

// ---------------------------------------------------------------------------
// Parse JSON response
// ---------------------------------------------------------------------------
const parseOutput = (raw) => {
  let title = null;
  let themes = null;
  if (!raw) return { title, themes };

  const trimmed = raw.trim();

  // Try JSON parse first
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (typeof json.title === 'string') title = json.title.trim();
      if (typeof json.themes === 'string') themes = json.themes.trim();
    } catch {
      // Fall through to regex
    }
  }

  // Regex fallback
  if (!title) {
    const m = raw.match(/"title"\s*:\s*"([^"]+)"/i);
    if (m) title = m[1].trim();
  }
  if (!themes) {
    const m = raw.match(/"themes"\s*:\s*"([^"]+)"/i);
    if (m) themes = m[1].trim();
  }

  return { title, themes };
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }
  body = body || {};

  const { dreamText, userId } = body;
  if (!dreamText || typeof dreamText !== 'string') {
    res.status(400).json({ error: 'Missing dreamText' });
    return;
  }

  const trimmedText = dreamText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!trimmedText) {
    res.status(400).json({ error: 'Empty dreamText' });
    return;
  }

  // Cache check
  const cacheKey = hashText(trimmedText);
  if (resultCache.has(cacheKey)) {
    res.status(200).json({ ...resultCache.get(cacheKey), cached: true });
    return;
  }

  // Rate limit
  if (!checkRateLimit(userId)) {
    res.status(429).json({ error: 'Daily analysis limit reached. Try again tomorrow.' });
    return;
  }

  // API key check
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[ai] OPENAI_API_KEY present:', !!apiKey);
  if (!apiKey) {
    console.error('[ai] Missing OPENAI_API_KEY env var');
    res.status(200).json({
      title: fallbackTitle(trimmedText),
      themes: fallbackThemes(),
      fallback: true,
      reason: 'API key not configured'
    });
    return;
  }

  // Call OpenAI
  let rawOutput = '';
  try {
    rawOutput = await callOpenAI(trimmedText, apiKey);
    console.log('[ai] OpenAI raw output:', rawOutput);
  } catch (err) {
    console.error('[ai] OpenAI call failed:', err.message);
    res.status(200).json({
      title: fallbackTitle(trimmedText),
      themes: fallbackThemes(),
      fallback: true,
      reason: err.message
    });
    return;
  }

  // Parse
  const { title: parsedTitle, themes: parsedThemes } = parseOutput(rawOutput);
  console.log('[ai] Parsed title:', parsedTitle, '| themes:', parsedThemes);

  const result = {
    title: parsedTitle || fallbackTitle(trimmedText),
    themes: parsedThemes || fallbackThemes(),
    fallback: !parsedTitle || !parsedThemes
  };

  // Cache result
  resultCache.set(cacheKey, { title: result.title, themes: result.themes });

  res.status(200).json(result);
};
