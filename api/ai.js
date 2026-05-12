const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const cache = new Map();
const MAX_LEN = 4000;
const MODEL = 'gpt-4o-mini';
const API_URL = 'https://api.openai.com/v1/chat/completions';
const PROMPT_ID_ALIASES = { investigator: 'director' };
const FREE_ALLOWED_PROMPT_STYLES = new Set(['balanced', 'coach', 'therapist']);

const PROMPT_TEMPLATES = {
  balanced: "You're here to break down dreams in a way that actually helps. Pick out 1-2 symbols that stand out and explain what they might mean, then drop a reflection question and one small thing they can actually do about it. Keep it real and useful-3-6 sentences max. Be warm but don't overcomplicate it.",
  coach: "You're checking this dream for stress signals and how their sleep's actually doing. Point out anything that screams anxiety, burnout, or restlessness, then suggest one thing they can try tonight to sleep better. 3-6 sentences. Keep it practical and supportive, not preachy.",
  therapist: "You're a gentle comfort AI for someone who just woke from a nightmare. Reassure them that the dream isn't real, validate the feelings it stirred up, and point to one hopeful takeaway or grounding reminder from the imagery. Offer 3-6 sentences that blend insight with soothing language so they leave calmer than they arrived.",
  scientist: "You're breaking down the neuroscience behind this dream-REM sleep, memory consolidation, emotional processing, all that. Explain why their brain cooked up this scenario in a way that actually makes sense. 3-6 sentences. Be smart but don't make it feel like a textbook.",
  mystical: "You're reading this dream through a spiritual lens, tapping into archetypes and universal symbols like the moon, shadows, journeys, rebirth. Use poetic language and pull out the deeper meaning or soul lesson they need to hear. 3-6 sentences. Be mystical and intentional, not vague.",
  creative: "You're helping turn their dream into story material. Point out the wildest or most vivid parts, suggest how it could work as a plot, character arc, or worldbuilding element, and keep them grounded while firing up their creativity. 3-6 sentences. Be inspiring without being extra.",
  director: "You're an auteur movie director retelling this dream as a film pitch. Describe the opening shot, key set pieces, tone, and how you'd translate the dream's message to the screen. It should feel like one vivid paragraph-bold, cinematic, occasionally unhinged but still coherent enough to spark the dreamer's imagination.",
  comedian: "You're finding the humor in how absurd dreams can get. Roast the weirdest parts with some playful commentary, but still acknowledge the real feelings underneath. 3-6 sentences. Be funny in a way that lands-warm and clever, not trying too hard."
};

const setCors = (res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const currentMonthYear = () => new Date().toISOString().slice(0, 7);
const normalizePromptStyle = (style) => PROMPT_ID_ALIASES[style] || style || 'balanced';
const isPromptStyleLockedForTier = (tier, style) => (
  tier !== 'premium' && !FREE_ALLOWED_PROMPT_STYLES.has(normalizePromptStyle(style))
);

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
    p_free_limit: 1
  });
  if (error) throw error;
  return data;
};

const checkAndIncrementQuotaFallback = async (uid, tier) => {
  const admin = getSupabaseAdmin();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('ai_usage')
    .eq('id', uid)
    .single();

  // If the column doesn't exist or profile is missing, treat as a fresh user
  // rather than hard-failing. A schema gap shouldn't block all AI usage.
  if (error) {
    console.error('Fallback quota load failed (treating as new user):', error.message);
  }

  const usage = (error ? null : profile?.ai_usage) || {};
  const monthYear = currentMonthYear();
  const storedMonth = typeof usage.monthYear === 'string' ? usage.monthYear : '';
  const isNewMonth = storedMonth !== monthYear;
  const monthlyCount = isNewMonth ? 0 : Number(usage.monthlyCount || 0);
  const creditBalance = Number(usage.creditBalance || 0);
  const limit = tier === 'premium' ? 30 : 1;

  let allowed = false;
  let usedCredit = false;
  let nextMonthlyCount = monthlyCount;
  let nextCreditBalance = creditBalance;

  if (monthlyCount < limit) {
    allowed = true;
    nextMonthlyCount = monthlyCount + 1;
  } else if (creditBalance > 0) {
    allowed = true;
    usedCredit = true;
    nextCreditBalance = creditBalance - 1;
  }

  if (!allowed) {
    return {
      allowed: false,
      tier,
      remainingFree: 0,
      creditBalance: Math.max(0, creditBalance)
    };
  }

  const nextUsage = {
    ...usage,
    monthYear,
    monthlyCount: nextMonthlyCount,
    creditBalance: Math.max(0, nextCreditBalance)
  };

  const { error: updateError } = await admin
    .from('profiles')
    .update({ ai_usage: nextUsage })
    .eq('id', uid);

  if (updateError) {
    // Log but don't hard-fail — if ai_usage column is missing the request still goes through
    console.error('Fallback quota update failed:', updateError.message);
  }

  return {
    allowed: true,
    usedCredit,
    tier,
    remainingFree: Math.max(0, limit - nextMonthlyCount),
    creditBalance: Math.max(0, nextCreditBalance)
  };
};

const getUserTier = async (uid) => {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('profiles')
    .select('subscription, email')
    .eq('id', uid)
    .single();
  if (error) {
    throw new Error(`Could not load subscription: ${error.message}`);
  }
  const tier = data?.subscription?.tier === 'premium' ? 'premium' : 'free';
  if (tier === 'premium') return 'premium';
  
  // Check if user's email is in the premium_emails env whitelist
  const premiumEmailsEnv = (process.env.PREMIUM_EMAILS || '').trim();
  if (premiumEmailsEnv) {
    const userEmail = (data?.email || '').toLowerCase();
    const premiumEmails = premiumEmailsEnv
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e);
    if (userEmail && premiumEmails.includes(userEmail)) {
      return 'premium';
    }
  }
  
  return 'free';
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

  const { dreamText, idToken, dreamId, customPrompt, promptStyle } = body;
  if (!dreamText || typeof dreamText !== 'string') return res.status(400).json({ error: 'Missing dreamText' });
  if (!idToken) return res.status(401).json({ error: 'Authentication required.' });

  const text = dreamText.trim().slice(0, MAX_LEN);
  if (!text) return res.status(400).json({ error: 'Empty dreamText' });

  // Verify token
  let uid;
  try { uid = await verifyToken(idToken); }
  catch { return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' }); }

  let tier = 'free';
  try {
    tier = await getUserTier(uid);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not verify subscription tier.' });
  }

  const normalizedStyle = normalizePromptStyle((promptStyle || '').trim() || 'balanced');
  if (isPromptStyleLockedForTier(tier, normalizedStyle)) {
    return res.status(403).json({
      error: 'That insight style is available on Pro only.',
      code: 'style_locked',
      tier
    });
  }

  // Check cache before quota (cached responses are free)
  const effectivePrompt = normalizedStyle === 'custom'
    ? ((tier === 'premium' ? customPrompt : null) || PROMPT_TEMPLATES.balanced)
    : (PROMPT_TEMPLATES[normalizedStyle] || PROMPT_TEMPLATES.balanced);

  const cacheKey = hash(text + effectivePrompt + normalizedStyle + uid);
  if (cache.has(cacheKey)) {
    return res.status(200).json({ ...cache.get(cacheKey), cached: true });
  }

  // Check and increment quota atomically
  let quota;
  try { quota = await checkAndIncrementQuota(uid); }
  catch (e) {
    console.error('Quota check RPC failed, using fallback:', e?.message || e, '| code:', e?.code);
    try {
      quota = await checkAndIncrementQuotaFallback(uid, tier);
    } catch (fallbackError) {
      const detail = fallbackError?.message || String(fallbackError);
      console.error('Quota fallback failed:', detail);
      return res.status(500).json({ error: `Could not verify usage quota: ${detail}` });
    }
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
  try { raw = await callOpenAI(text, apiKey, effectivePrompt, contextBlock); }
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
