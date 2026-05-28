const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const Astronomy = require('astronomy-engine');

const cache = new Map();
const MAX_LEN = 5000;
const MODEL = 'gpt-4o-mini';
const API_URL = 'https://api.openai.com/v1/chat/completions';
const PROMPT_ID_ALIASES = { investigator: 'director' };
const FREE_ALLOWED_PROMPT_STYLES = new Set(['balanced', 'coach', 'therapist']);
// For an 18+ app we only block content that Apple explicitly prohibits:
// CSAM, content that promotes or glorifies real-world violence/terrorism,
// self-harm encouragement, and content that sexualises minors.
// General adult themes, mild profanity, and dream-context violence are allowed.
const TEEN_UNSAFE_PATTERNS = [
  /\bkill yourself\b/i,
  /\bkys\b/i,
  /\bself[-\s]?harm\b/i,
  /\bcut(?:ting)? myself\b/i,
  /\bsuicide\s+(method|how|guide|plan)\b/i,
  /\bchild porn\b/i,
  /\bc\.s\.a\.m\b/i,
  /\bcsam\b/i,
  /\bunderage\s+sex\b/i,
  /\bchild\s+(?:sexual|sex)\b/i,
  /\bminor\s+(?:sexual|sex|nude|naked)\b/i,
  /\bterroris(?:t|m)\s+(?:attack|manifesto|recruit)\b/i,
  /\bwhite\s+supremac(?:y|ist)\b/i,
  /\bgenocide\s+(?:is\s+)?(?:good|great|right|justified)\b/i,
];

const SAFE_AI_TITLE_FALLBACK = 'Reflective Dream';
const SAFE_AI_THEMES_FALLBACK = 'Some details were removed from this analysis as they fall outside what the AI can discuss. Use this as a general reflection only. AI output may be inaccurate and is not medical, mental health, legal, or safety advice.';

// Shared base: output contract, length, safety, and speculative-language rules.
// All style deltas inherit this — never repeat format instructions inside a delta.
const BASE_PROMPT = `You are a dream analysis assistant on NightLink, an 18+ dream journaling app.
Analyze the dream through your assigned lens and return ONLY minified JSON: {"title":"string","themes":"string","connections":[]}

- "title": a poetic, evocative 2–4 word phrase that names this specific dream (never generic)
- "themes": your full analysis in your assigned voice
- "connections": array of short strings (under 15 words each) for patterns explicitly recorded in the dreamer's memory file that also appear in this dream. Only cite a connection if it is stated in the memory — do not infer, guess, or hallucinate recurring themes. Return [] if no memory context was provided or no overlap exists.
- Use speculative language ("may suggest", "could reflect", "seems to")
- Engage thoughtfully with mature content as it naturally appears in dreams; never encourage self-harm or glorify real-world violence
- If the dream touches on self-harm or suicidal themes, respond with warm, grounded support`;

// Per-style persona and interpretive methodology — no format instructions here.
const STYLE_DELTAS = {
  balanced:
    "You are a thoughtful, grounded dream interpreter — no mysticism, no jargon, just honest insight. Identify 1-2 standout symbols and explain what they may reveal about the dreamer's inner life right now. Ask one precise reflection question that could genuinely unlock something for them. Close with a single, concrete small action they could take today. Warm, clear, never condescending.",

  coach:
    "You are a performance and recovery coach who specializes in sleep quality and stress physiology. Scan this dream for signals of cognitive overload, unresolved pressure, or avoidance patterns — name what you find specifically. Explain what the nervous system may be processing during this REM content. Deliver one targeted, practical suggestion the dreamer can implement tonight to reduce whatever stress this dream is mirroring. Supportive and direct, zero fluff.",

  therapist:
    "You are an attachment-informed, trauma-aware therapist. Your first move is always emotional validation — name what this dream likely felt like in the body without assuming the worst. Gently surface the core emotional need or fear the imagery may be expressing. Offer one grounding reframe or hopeful perspective rooted in the specific imagery, not platitudes. Close with a brief, compassionate observation about what this dream may be asking the dreamer to hold more gently. Soft, precise, never clinical.",

  scientist:
    "You are a cognitive neuroscientist specializing in sleep and memory. Explain which brain systems were likely active during this specific dream content — default mode network, limbic circuits, prefrontal suppression, memory consolidation, emotional regulation — and why this particular scenario emerged. Connect it to documented REM mechanisms: threat simulation, emotional memory replay, predictive modeling, or social cognition processing. Smart and specific, grounded in real neuroscience, but readable — not a journal abstract.",

  mystical:
    "You are a depth-psychology-informed mystic fluent in Jungian archetypes, cross-cultural mythology, and universal symbol systems. Identify which archetypal figures or threshold symbols appear — shadow, anima/animus, trickster, death-rebirth, the void, the guide — and speak to what the psyche is negotiating at a soul level. Use language that honors the numinous without being vague. End with a single oracular sentence that names the deeper invitation this dream is extending. Poetic, precise, spiritually grounded.",

  creative:
    "You are a working fiction writer and story architect. Identify the latent narrative structure in this dream — the inciting wound, the archetypal character roles, the genre this world belongs to. Surface the story this dream is already telling and show the dreamer how it could become something real: a first scene, a character study, a world with its own rules. Give one sharp, specific writing prompt pulled directly from the dream's most vivid or strange detail. Energizing, craft-focused, never generic.",

  director:
    "You are an auteur film director with a singular visual grammar. Write the pitch: open with the exact establishing shot, name the cinematographic style and emotional register, describe one pivotal image with sensory specificity, and state the thematic question this film would pose. This is a treatment, not a summary — make bold aesthetic choices. One tight, cinematic paragraph. Visually precise, tonally committed, occasionally unhinged in the best way.",

  comedian:
    "You are a sharp observational comedian who finds the genuine absurdity in how the subconscious works. Identify the most surreal, contradictory, or structurally ridiculous element of this dream and land a joke on it — the kind of humor that makes someone feel seen, not mocked. Still acknowledge the real emotional texture underneath; the best dream comedy is always at least a little true. Funny in a way that lands — warm, specific, never punching down.",

  astrology:
    "You are a practicing astrologer who reads dreams through the lens of the sky. Use the planetary positions in the sky context block — moon phase and sign, the sun, and the visible planets — as your source material. Don't work through each planet in sequence; instead, let the sky tell a coherent story. Lead with what feels most alive in the chart that night and connect it to what's most alive in the dream. Name specific planets and signs when they illuminate something, skip them when they don't. End with a brief, grounded sense of what this sky was asking of the dreamer — not a directive, just an honest read. Flowing prose, no headers. Precise where the chart is interesting, quiet where it isn't."
};

// Per-style temperature — higher for expressive/generative styles, lower for analytical ones.
const STYLE_TEMPERATURE = {
  balanced:  0.70,
  coach:     0.60,
  therapist: 0.60,
  scientist: 0.50,
  mystical:  0.85,
  creative:  0.88,
  director:  0.90,
  comedian:  0.85,
  astrology: 0.75,
};

// Per-style token budget — astrology needs more room to cover every planet.
const STYLE_MAX_TOKENS = {
  balanced:  650,
  coach:     650,
  therapist: 650,
  scientist: 700,
  mystical:  680,
  creative:  680,
  director:  650,
  comedian:  600,
  astrology: 800,
};

// Keep PROMPT_TEMPLATES as an alias so the custom-style path and any callers still work.
const PROMPT_TEMPLATES = STYLE_DELTAS;

const ZODIAC_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const eclipticToSign = (lon) => ZODIAC_SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
const moonPhaseName = (phase) => {
  if (phase < 45)  return 'new moon';
  if (phase < 90)  return 'waxing crescent';
  if (phase < 135) return 'first quarter';
  if (phase < 180) return 'waxing gibbous';
  if (phase < 225) return 'full moon';
  if (phase < 270) return 'waning gibbous';
  if (phase < 315) return 'last quarter';
  return 'waning crescent';
};

const buildAstrologyContext = (dateStr) => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const phase    = Astronomy.MoonPhase(date);
    const sun      = Astronomy.SunPosition(date);
    const moonLon  = (sun.elon + phase) % 360;
    const illum    = Math.round((1 - Math.cos(phase * Math.PI / 180)) / 2 * 100);
    const moonSign = eclipticToSign(moonLon);
    const sunSign  = eclipticToSign(sun.elon);
    const phaseName = moonPhaseName(phase);
    const planetSigns = ['Mercury','Venus','Mars','Jupiter','Saturn'].map((body) => {
      try {
        const ecl = Astronomy.Ecliptic(Astronomy.GeoVector(body, date, true));
        return `${body} in ${eclipticToSign(ecl.elon)}`;
      } catch { return null; }
    }).filter(Boolean);
    const label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `[Sky context for ${label}: Moon in ${moonSign} (${phaseName}, ${illum}% illuminated), Sun in ${sunSign}. ${planetSigns.join(', ')}.]`;
  } catch {
    return '';
  }
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
const containsTeenUnsafeText = (text = '') => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  return TEEN_UNSAFE_PATTERNS.some((pattern) => pattern.test(normalized));
};
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

// Reverse a quota increment when the AI call fails — no charge on error
const refundQuota = async (uid, usedCredit) => {
  try {
    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('ai_usage')
      .eq('id', uid)
      .single();
    if (!profile?.ai_usage) return;
    const usage = profile.ai_usage;
    if (usage.monthYear !== currentMonthYear()) return; // stale month, nothing to undo
    const updated = usedCredit
      ? { ...usage, creditBalance: Number(usage.creditBalance || 0) + 1 }
      : { ...usage, monthlyCount: Math.max(0, Number(usage.monthlyCount || 0) - 1) };
    await admin.from('profiles').update({ ai_usage: updated }).eq('id', uid);
  } catch (e) {
    console.error('Quota refund failed:', e.message);
  }
};

// Read the user's persistent dream memory file
const getDreamMemory = async (uid) => {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('profiles')
    .select('dream_memory')
    .eq('id', uid)
    .single();
  return data?.dream_memory || null;
};

// Fire-and-forget: update the dream memory file after a successful analysis
const updateDreamMemory = async (uid, dreamText, aiTitle, aiInsights, currentMemory, apiKey) => {
  const systemPrompt = `You maintain a private dream memory file for a single user. After each analyzed dream, update the file by merging in new patterns, symbols, and themes.

Use only the headings that have content (omit empty ones):
## Recurring symbols
## Recurring figures & people
## Emotional patterns
## Life themes (inferred)
## Notable narratives

Rules:
- Keep total length under 1200 words
- Use concise note-style writing, not full prose sentences
- Track rough occurrence counts where useful (e.g. "water: ~8 times")
- Merge new information into existing entries — never duplicate
- Add new entries only when genuinely novel
- When nearing the length limit, consolidate or trim rare/low-signal entries
- Never include raw dream text — only synthesized patterns and observations
- Do not reference specific dates or dream IDs

Return ONLY the updated memory file. No preamble or explanation.`;

  const userContent = [
    `Current memory:\n${currentMemory || '(empty — this is the first entry)'}`,
    `---`,
    `New dream title: ${aiTitle}`,
    `Dream content: ${dreamText.slice(0, 2000)}`,
    `AI analysis: ${aiInsights}`,
  ].join('\n');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const updatedMemory = data.choices?.[0]?.message?.content?.trim();
    if (!updatedMemory) return;
    const admin = getSupabaseAdmin();
    await admin.from('profiles').update({
      dream_memory: updatedMemory,
      dream_memory_updated_at: new Date().toISOString(),
    }).eq('id', uid);
  } catch (e) {
    console.error('Dream memory update failed:', e.message);
  }
};

const buildSystemPrompt = (styleDelta, contextBlock) => {
  const parts = [BASE_PROMPT, styleDelta || STYLE_DELTAS.balanced];
  if (contextBlock) {
    parts.push(`${contextBlock}

MEMORY DIRECTIVE: This dreamer has a recorded history. Use it honestly:
- In your "themes" text, reference a memory pattern only if it genuinely appears in this dream — e.g. "Water has come up in your dreams before; here it shifts from still to rushing..." Never fabricate a connection that isn't supported by the memory file.
- Populate the "connections" array ONLY with patterns that are (a) explicitly listed in the memory file AND (b) clearly present in this dream. If a symbol from this dream is not in the memory file, do not claim it recurs. Return [] if nothing overlaps.
- Accuracy matters more than fullness. Fewer real connections are better than more invented ones.`);
  }
  return parts.join('\n\n');
};

const callOpenAI = async (text, apiKey, styleDelta, contextBlock, temperature = 0.7, maxTokens = 500) => {
  const sys = buildSystemPrompt(styleDelta, contextBlock);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Dream:\n"""${text}"""` }
      ],
      max_tokens: maxTokens,
      temperature
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
  if (!raw) return { title: null, themes: null, connections: [] };
  const t = raw.trim();
  let title = null, themes = null, connections = [];
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      title = j.title?.trim() || null;
      themes = j.themes?.trim() || null;
      connections = Array.isArray(j.connections)
        ? j.connections.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
        : [];
    } catch (e) { console.error('JSON parse error:', e.message); }
  }
  if (!title) { const m = raw.match(/"title"\s*:\s*"([^"]+)"/i); if (m) title = m[1].trim(); }
  if (!themes) { const m = raw.match(/"themes"\s*:\s*"([^"]+)"/i); if (m) themes = m[1].trim(); }
  return { title, themes, connections };
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

  const { dreamText, idToken, dreamId, customPrompt, promptStyle, dreamDate, isMemoryIndexed } = body;
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
  let effectivePrompt = normalizedStyle === 'custom'
    ? ((tier === 'premium' ? customPrompt : null) || PROMPT_TEMPLATES.balanced)
    : (PROMPT_TEMPLATES[normalizedStyle] || PROMPT_TEMPLATES.balanced);

  if (normalizedStyle === 'astrology' && dreamDate) {
    const skyContext = buildAstrologyContext(dreamDate);
    if (skyContext) effectivePrompt = `${effectivePrompt}\n\n${skyContext}`;
  }

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

  // Load dream memory for premium users (used as analysis context)
  let contextBlock = null;
  let currentMemory = null;
  if (quota.tier === 'premium') {
    try {
      currentMemory = await getDreamMemory(uid);
      if (currentMemory) {
        contextBlock = `[Dream memory — this dreamer's recurring symbols, patterns, and themes]\n${currentMemory}`;
      }
    } catch (e) { console.error('Dream memory fetch failed:', e.message); }
  }

  const temperature = STYLE_TEMPERATURE[normalizedStyle] ?? 0.7;
  const maxTokens = STYLE_MAX_TOKENS[normalizedStyle] ?? 500;

  let raw = '';
  try { raw = await callOpenAI(text, apiKey, effectivePrompt, contextBlock, temperature, maxTokens); }
  catch (e) {
    refundQuota(uid, quota.usedCredit).catch(() => {});
    return res.status(502).json({ error: e.message || 'AI failed.' });
  }

  const { title, themes, connections } = parse(raw);
  if (!title || !themes) {
    refundQuota(uid, quota.usedCredit).catch(() => {});
    return res.status(502).json({ error: 'Incomplete AI response.' });
  }

  const safeTitle = containsTeenUnsafeText(title) ? SAFE_AI_TITLE_FALLBACK : title;
  const safeThemes = containsTeenUnsafeText(themes) ? SAFE_AI_THEMES_FALLBACK : themes;
  const safetyFiltered = safeTitle !== title || safeThemes !== themes;

  const result = { title: safeTitle, themes: safeThemes, connections, safetyFiltered };
  cache.set(cacheKey, result);

  // Update dream memory if this dream hasn't been indexed yet — regardless of whether
  // it's a re-generation. Once indexed, mark the dream so future re-analyses don't re-count it.
  if (quota.tier === 'premium' && !safetyFiltered && !isMemoryIndexed && dreamId) {
    updateDreamMemory(uid, text, safeTitle, safeThemes, currentMemory, apiKey)
      .then(() => {
        getSupabaseAdmin()
          .from('dreams')
          .update({ memory_indexed: true })
          .eq('id', dreamId)
          .catch(() => {});
      })
      .catch(() => {});
  }

  res.status(200).json({
    ...result,
    connections,
    tier: quota.tier,
    remainingFree: quota.remainingFree,
    creditBalance: quota.creditBalance,
    usedCredit: quota.usedCredit ?? false
  });
};
