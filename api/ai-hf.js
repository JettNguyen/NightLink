const crypto = require('crypto');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowWildcard = allowedOrigins.includes('*');

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (!allowedOrigins.length) return true;
  if (allowWildcard) return true;
  return allowedOrigins.includes(origin);
};

const applyCors = (req, res) => {
  const origin = req.headers.origin || '';
  const originAllowed = isOriginAllowed(origin);

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', allowWildcard ? '*' : origin || '*');
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');

  return originAllowed;
};

const resultCache = new Map();
const userLimits = new Map();

const DAILY_LIMIT = 5;
const MAX_INPUT_LENGTH = 4000;

const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

const hashDream = (text) => crypto.createHash('sha256').update(text).digest('hex');
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

const fallbackTitle = (text) => {
  const words = (text || '').trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
  if (!words.length) return 'Untitled Dream';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const fallbackThemes = () => 'Unable to generate themes at this time. Try again later.';

const callHuggingFace = async (dreamText, token) => {
  const prompt = `You are a reflective dream interpreter helping users title their dreams and summarize themes.\n\nInstructions:\n- Respond ONLY with minified JSON (no markdown, prose, or code fences).\n- Schema: {"title":"string (2-4 words)", "themes":"single short paragraph"}\n- Title should be evocative but non-clinical. Themes must use tentative language ("might", "could").\n- If details are unclear, still produce your best safe guess.\n\nDream:\n"""${dreamText}"""`;

  const payload = {
    inputs: prompt,
    parameters: {
      max_new_tokens: 180,
      temperature: 0.7,
      return_full_text: false,
    },
    options: {
      wait_for_model: true,
    },
  };

  const response = await fetch(HF_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HF API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;
  if (data?.generated_text) return data.generated_text;
  throw new Error('Unexpected HF response shape');
};

const parseModelOutput = (raw) => {
  let title = null;
  let themes = null;
  if (!raw) return { title, themes };

  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (typeof json.title === 'string') {
        title = json.title.trim();
      }
      if (typeof json.themes === 'string') {
        themes = json.themes.trim();
      }
    } catch {
      // Ignore malformed JSON and continue to regex parsing
    }
  }

  if (!title) {
    const titleMatch = raw.match(/Title:\s*(.+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  if (!themes) {
    const themesMatch = raw.match(/Themes:\s*([\s\S]+)/i);
    if (themesMatch) {
      themes = themesMatch[1].split(/\n{2,}/)[0].trim();
    }
  }

  return { title, themes };
};

module.exports = async function handler(req, res) {
  const originAllowed = applyCors(req, res);

  if (!originAllowed) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST allowed' });
    return;
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }
  payload = payload || {};

  const { dreamText, userId } = payload;
  if (!dreamText || typeof dreamText !== 'string') {
    res.status(400).json({ error: 'Missing dreamText' });
    return;
  }

  const trimmedText = dreamText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!trimmedText) {
    res.status(400).json({ error: 'Empty dreamText' });
    return;
  }

  const cacheKey = hashDream(trimmedText);
  if (resultCache.has(cacheKey)) {
    res.status(200).json({ ...resultCache.get(cacheKey), cached: true });
    return;
  }

  if (!checkRateLimit(userId)) {
    res.status(429).json({ error: 'Daily analysis limit reached. Try again tomorrow.' });
    return;
  }

  const token = process.env.HF_API_TOKEN;
  if (!token) {
    res.status(200).json({
      title: fallbackTitle(trimmedText),
      themes: fallbackThemes(),
      fallback: true,
      reason: 'API token not configured',
    });
    return;
  }

  let rawOutput = '';
  try {
    rawOutput = await callHuggingFace(trimmedText, token);
  } catch (err) {
    res.status(200).json({
      title: fallbackTitle(trimmedText),
      themes: fallbackThemes(),
      fallback: true,
      reason: err.message,
    });
    return;
  }

  const { title: parsedTitle, themes: parsedThemes } = parseModelOutput(rawOutput);
  const result = {
    title: parsedTitle || fallbackTitle(trimmedText),
    themes: parsedThemes || fallbackThemes(),
    fallback: !parsedTitle || !parsedThemes,
  };

  resultCache.set(cacheKey, { title: result.title, themes: result.themes });
  res.status(200).json(result);
};
