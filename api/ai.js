const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const cache = new Map();
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
const currentMonthYear = () => new Date().toISOString().slice(0, 7);

const getSupabaseAdmin = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Verify user token and return uid
const verifyToken = async (token) => {
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Invalid or expired session.');
  return user.id;
};

// Atomically check and increment AI quota via Postgres function
const checkAndIncrementQuota = async (uid) => {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('check_and_increment_ai_quota', {
    p_user_id:    uid,
    p_month_year: currentMonthYear(),
    p_free_limit: 5
  });
  if (error) throw new Error(`Quota check failed: ${error.message}`);
  return data;
};

// Fetch the user's last 10 AI-analyzed dreams for premium pattern context
const buildPremiumContext = async (uid, excludeDreamId) => {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('dreams')
    .select('id, ai_title, title, ai_insights')
    .eq('user_id', uid)
    .eq('ai_generated', true)
    .order('created_at', { ascending: false })
    .limit(12);
  const { data } = await query;
  const analyzed = (data || [])
    .filter((r) => r.id !== excludeDreamId)
    .slice(0, 10);
  if (!analyzed.length) return null;
  const lines = analyzed.map((r) => {
    const title = (r.ai_title || r.title || 'Untitled').trim();
    const insights = (r.ai_insights || '').slice(0, 200).trim();
    return `- "${title}": ${insights}`;
  });
  return `[Your recent dream history — use this to identify recurring symbols, names, places, and themes]\n${lines.join('\n')}`;
};

const buildSystemPrompt = (customPrompt, contextBlock) => {
  const base = customPrompt
    ? `${customPrompt}\n\nAlso generate a short poetic title (2-4 words). Return only minified JSON: {"title":"string","themes":"string"} where "themes" contains your full analysis.`
    : `You are a creative dream interpreter. Generate a short poetic title (2-4 words) and a brief themes paragraph. Use speculative language. Return only minified JSON: {"title":"string","themes":"string"}`;
  if (!contextBlock) return base;
  return `${base}\n\n${contextBlock}\n\nReference the above history if relevant — note recurring symbols, names, or patterns when they appear in this dream too.`;
};

const callOpenAI = async (text, apiKey, customPrompt, contextBlock) => {
  const sys = buildSystemPrompt(customPrompt, contextBlock);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
    try { const j = JSON.parse(t); title = j.title?.trim() || null; themes = j.themes?.trim() || null; }
    catch (e) { console.error('JSON parse error:', e.message); }
  }
  if (!title) { const m = raw.match(/"title"\s*:\s*"([^"]+)"/i); if (m) title = m[1].trim(); }
  if (!themes) { const m = raw.match(/"themes"\s*:\s*"([^"]+)"/i); if (m) themes = m[1].trim(); }
  return { title, themes };
};

module.exports = async function handler(req, res) {
  setCors(res, req.headers?.origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  body = body || {};

  const { dreamText, idToken, dreamId, customPrompt } = body;
  if (!dreamText || typeof dreamText !== 'string') return res.status(400).json({ error: 'Missing dreamText' });
  if (!idToken) return res.status(401).json({ error: 'Authentication required.' });

  const text = dreamText.trim().slice(0, MAX_LEN);
  if (!text) return res.status(400).json({ error: 'Empty dreamText' });

  // Verify token
  let uid;
  try { uid = await verifyToken(idToken); }
  catch { return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' }); }

  // Check cache before quota (cached responses are free)
  const cacheKey = hash(text + (customPrompt || '') + uid);
  if (cache.has(cacheKey)) {
    return res.status(200).json({ ...cache.get(cacheKey), cached: true });
  }

  // Check and increment quota atomically
  let quota;
  try { quota = await checkAndIncrementQuota(uid); }
  catch (e) {
    console.error('Quota check failed:', e.message);
    return res.status(500).json({ error: 'Could not verify usage quota.' });
  }

  if (!quota.allowed) {
    return res.status(429).json({
      error: 'Monthly limit reached.',
      code: 'quota_exceeded',
      remainingFree: 0,
      creditBalance: quota.creditBalance ?? 0
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured.' });

  // Build premium context from prior analyzed dreams
  let contextBlock = null;
  if (quota.tier === 'premium') {
    try { contextBlock = await buildPremiumContext(uid, dreamId || null); }
    catch (e) { console.error('Premium context fetch failed:', e.message); }
  }

  let raw = '';
  try { raw = await callOpenAI(text, apiKey, customPrompt || null, contextBlock); }
  catch (e) { return res.status(502).json({ error: e.message || 'AI failed.' }); }

  const { title, themes } = parse(raw);
  if (!title || !themes) return res.status(502).json({ error: 'Incomplete AI response.' });

  const result = { title, themes };
  cache.set(cacheKey, result);

  res.status(200).json({
    ...result,
    tier: quota.tier,
    remainingFree: quota.remainingFree,
    creditBalance: quota.creditBalance,
    usedCredit: quota.usedCredit ?? false
  });
};
