const crypto = require('crypto');

const resultCache = new Map();
const userLimits = new Map();
const DAILY_LIMIT = 10;
const MAX_INPUT_LENGTH = 4000;
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const applyCors = (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
};

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

const callOpenAI = async (dreamText, apiKey) => {
  const systemPrompt = `
You are a creative but cautious dream interpreter.

Your task:
- Generate a short poetic title (2–4 words)
- Generate a brief themes paragraph reflecting emotions, symbols, or tensions

Rules:
- Use speculative language only (might, could, seems, may)
- Avoid clinical, diagnostic, or absolute statements
- Do not give advice or conclusions
- Do not restate the dream literally
- Keep tone reflective and symbolic

Output:
- Return ONLY valid minified JSON
- No markdown, no extra text, no explanations
- Exact schema:
{"title":"string","themes":"string"}

Title constraints:
- 2–4 words
- No punctuation
- Evocative but simple
- Avoid generic words like dream, feeling, mind

Themes constraints:
- One short paragraph
- Focus on emotional themes or symbolic meaning
- Avoid phrases like 'this dream means' or 'this represents'
`;
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

const parseOutput = (raw) => {
  let title = null;
  let themes = null;
  if (!raw) return { title, themes };

  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (typeof json.title === 'string') title = json.title.trim();
      if (typeof json.themes === 'string') themes = json.themes.trim();
    } catch {
      // fall through to regex
    }
  }

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

  const cacheKey = hashText(trimmedText);
  if (resultCache.has(cacheKey)) {
    res.status(200).json({ ...resultCache.get(cacheKey), cached: true });
    return;
  }

  if (!checkRateLimit(userId)) {
    res.status(429).json({ error: 'Daily analysis limit reached. Try again tomorrow.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'AI analysis is not configured on the server.' });
    return;
  }

  let rawOutput = '';
  try {
    rawOutput = await callOpenAI(trimmedText, apiKey);
  } catch (err) {
    res.status(502).json({ error: err.message || 'AI request failed.' });
    return;
  }

  const { title: parsedTitle, themes: parsedThemes } = parseOutput(rawOutput);
  if (!parsedTitle || !parsedThemes) {
    res.status(502).json({ error: 'AI response was incomplete.' });
    return;
  }

  const result = { title: parsedTitle, themes: parsedThemes };
  resultCache.set(cacheKey, result);
  res.status(200).json(result);
};