/**
 * Serverless function: AI Dream Analysis via Hugging Face Inference API (free tier)
 *
 * Endpoint: POST /.netlify/functions/ai-hf
 * Body: { dreamText: string, userId?: string }
 *
 * Environment variables required:
 *   HF_API_TOKEN - Hugging Face access token (free to create at hf.co/settings/tokens)
 *
 * Features:
 *   - Uses Mistral-7B-Instruct (open, free tier compatible)
 *   - Simple in-memory cache keyed by hash of dream text
 *   - Per-user daily rate limit (5 analyses/day)
 *   - Returns { title, themes } or graceful fallback
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// CORS headers for browser requests
// ---------------------------------------------------------------------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ---------------------------------------------------------------------------
// Simple in-memory caches (reset on cold start, but fine for serverless demo)
// ---------------------------------------------------------------------------
const resultCache = new Map();   // hash(dreamText) -> { title, themes }
const userLimits = new Map();    // userId -> { date: 'YYYY-MM-DD', count: number }

const DAILY_LIMIT = 5;
const MAX_INPUT_LENGTH = 4000; // characters

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of dream text, used as cache key */
const hashDream = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Get today's date string for rate limiting */
const todayString = () => new Date().toISOString().slice(0, 10);

/** Check & increment rate limit. Returns true if allowed. */
const checkRateLimit = (userId) => {
  if (!userId) return true; // anonymous users skip limit (optional: block instead)
  const today = todayString();
  const record = userLimits.get(userId);
  if (!record || record.date !== today) {
    userLimits.set(userId, { date: today, count: 1 });
    return true;
  }
  if (record.count >= DAILY_LIMIT) {
    return false;
  }
  record.count += 1;
  return true;
};

/** Fallback title when AI fails */
const fallbackTitle = (text) => {
  const words = (text || '').trim().split(/\s+/).slice(0, 4);
  if (!words.length || !words[0]) return 'Untitled Dream';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/** Fallback themes paragraph */
const fallbackThemes = () => 'Unable to generate themes at this time. Try again later.';

// ---------------------------------------------------------------------------
// Hugging Face Inference call
// ---------------------------------------------------------------------------

const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

/**
 * Call Hugging Face Inference API with the instruct prompt.
 * Returns raw generated text or throws on failure.
 */
const callHuggingFace = async (dreamText, token) => {
  const systemPrompt = `You are a reflective dream interpreter.

Dream:
"""${dreamText}"""

Return:
Title (2–4 words)
Themes (1 short paragraph, speculative, non-clinical)`;

  const payload = {
    inputs: systemPrompt,
    parameters: {
      max_new_tokens: 180,
      temperature: 0.7,
      return_full_text: false,
    },
    options: {
      wait_for_model: true, // allows cold model to spin up (free tier)
    },
  };

  const res = await fetch(HF_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HF API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  // HF returns [{ generated_text: "..." }]
  if (Array.isArray(data) && data[0]?.generated_text) {
    return data[0].generated_text;
  }
  // Or sometimes just { generated_text: "..." }
  if (data?.generated_text) {
    return data.generated_text;
  }

  throw new Error('Unexpected HF response shape');
};

// ---------------------------------------------------------------------------
// Parse model output
// ---------------------------------------------------------------------------

/**
 * Safely parse the expected format:
 *   Title: <2–4 word title>
 *   Themes: <short paragraph>
 *
 * Returns { title, themes } or nulls if parsing fails.
 */
const parseModelOutput = (raw) => {
  let title = null;
  let themes = null;

  if (!raw) return { title, themes };

  // Try to extract "Title: ..." line

  const titleMatch = raw.match(/Title:\s*(.+)/i);
  if (titleMatch) {
    title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  // Try to extract "Themes: ..." (can be multiline)
  const themesMatch = raw.match(/Themes:\s*([\s\S]+)/i);
  if (themesMatch) {
    // Take first paragraph, stop at double newline or end
    themes = themesMatch[1].split(/\n{2,}/)[0].trim();
  }

  return { title, themes };
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Only POST allowed' };
  }

  // Parse body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { dreamText, userId } = payload;

  // Validate input
  if (!dreamText || typeof dreamText !== 'string') {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing dreamText' }) };
  }

  const trimmedText = dreamText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!trimmedText) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Empty dreamText' }) };
  }

  // Check cache first

  const cacheKey = hashDream(trimmedText);
  if (resultCache.has(cacheKey)) {
    const cached = resultCache.get(cacheKey);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cached, cached: true }),
    };
  }

  // Rate limit
  if (!checkRateLimit(userId)) {
    return {
      statusCode: 429,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Daily analysis limit reached. Try again tomorrow.' }),
    };
  }

  // Check for HF token
  const token = process.env.HF_API_TOKEN;
  if (!token) {
    console.error('HF_API_TOKEN missing');
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fallbackTitle(trimmedText),
        themes: fallbackThemes(),
        fallback: true,
        reason: 'API token not configured',
      }),
    };
  }

  // Call Hugging Face
  let rawOutput = '';
  try {
    rawOutput = await callHuggingFace(trimmedText, token);
  } catch (err) {
    console.error('HF call failed:', err.message);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fallbackTitle(trimmedText),
        themes: fallbackThemes(),
        fallback: true,
        reason: err.message,
      }),
    };
  }

  // Parse output
  const { title: parsedTitle, themes: parsedThemes } = parseModelOutput(rawOutput);

  const result = {
    title: parsedTitle || fallbackTitle(trimmedText),
    themes: parsedThemes || fallbackThemes(),
    fallback: !parsedTitle || !parsedThemes,
  };

  // Cache result
  resultCache.set(cacheKey, { title: result.title, themes: result.themes });

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
};
