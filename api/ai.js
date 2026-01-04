const crypto = require('node:crypto');

const cache = new Map();
const limits = new Map();
const DAILY_CAP = 10;
const MAX_LEN = 4000;
const MODEL = 'gpt-4o-mini';
const API_URL = 'https://api.openai.com/v1/chat/completions';

const setCors = (res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

const withinLimit = (uid) => {
  if (!uid) return true;
  const d = today();
  const rec = limits.get(uid);
  if (!rec || rec.date !== d) {
    limits.set(uid, { date: d, count: 1 });
    return true;
  }
  if (rec.count >= DAILY_CAP) return false;
  rec.count++;
  return true;
};

const callOpenAI = async (text, key, customPrompt = null) => {
  const defaultSys = `You are a creative dream interpreter. Generate a short poetic title (2-4 words) and a brief themes paragraph. Use speculative language. Return only minified JSON: {"title":"string","themes":"string"}`;
  
  const sys = customPrompt 
    ? `${customPrompt}\n\nAlso generate a short poetic title (2-4 words). Return only minified JSON: {"title":"string","themes":"string"} where "themes" contains your full analysis.`
    : defaultSys;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Dream:\n"""${text}"""` }
      ],
      max_tokens: 400,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI response');
  return content;
};

const parse = (raw) => {
  if (!raw) return { title: null, themes: null };
  const t = raw.trim();
  let title = null, themes = null;

  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      title = j.title?.trim() || null;
      themes = j.themes?.trim() || null;
    } catch { /* use regex fallback */ }
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
  setCors(res, req.headers?.origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  body = body || {};

  const { dreamText, userId, customPrompt } = body;
  if (!dreamText || typeof dreamText !== 'string') {
    return res.status(400).json({ error: 'Missing dreamText' });
  }

  const text = dreamText.trim().slice(0, MAX_LEN);
  if (!text) return res.status(400).json({ error: 'Empty dreamText' });

  const key = hash(text + (customPrompt || ''));
  if (cache.has(key)) {
    return res.status(200).json({ ...cache.get(key), cached: true });
  }

  if (!withinLimit(userId)) {
    return res.status(429).json({ error: 'Daily limit reached. Try tomorrow.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI not configured.' });
  }

  let raw = '';
  try {
    raw = await callOpenAI(text, apiKey, customPrompt);
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI failed.' });
  }

  const { title, themes } = parse(raw);
  if (!title || !themes) {
    return res.status(502).json({ error: 'Incomplete AI response.' });
  }

  const result = { title, themes };
  cache.set(key, result);
  res.status(200).json(result);
};