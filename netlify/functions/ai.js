const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let geminiClientPromise;

const getGeminiClient = async (apiKey) => {
  if (!geminiClientPromise) {
    geminiClientPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  }
  return geminiClientPromise;
};

const extractGeminiText = async (response) => {
  if (!response) return '';

  const { text } = response;
  if (typeof text === 'function') {
    try {
      const value = await text.call(response);
      if (typeof value === 'string') return value;
    } catch (err) {
      console.warn('Gemini text() extraction failed', err?.message);
    }
  }

  if (typeof text === 'string') {
    return text;
  }

  const candidateSources = [response?.result?.candidates, response?.response?.candidates, response?.candidates];
  for (const source of candidateSources) {
    if (!Array.isArray(source) || !source.length) continue;
    const parts = source[0]?.content?.parts?.map((part) => part.text).filter(Boolean);
    if (parts?.length) {
      return parts.join('\n').trim();
    }
  }

  return '';
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Only POST allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers: corsHeaders, body: 'Invalid JSON' };
  }

  const { content } = payload;
  if (!content) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing content' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing in Netlify environment');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'AI key missing on server',
        debug: {
          keyPresent: false,
          provider: 'gemini',
          envSeen: !!process.env.GEMINI_API_KEY,
          hint: 'Set GEMINI_API_KEY in Netlify env and redeploy'
        }
      })
    };
  }

  console.info('Gemini key detected on server (length):', apiKey.length);

  const fallbackTitle = (text) => {
    if (!text) return 'Untitled dream';
    const clipped = text.trim().slice(0, 64);
    return clipped.length === text.trim().length ? clipped : `${clipped}…`;
  };

  const fallbackInsights = (text) => {
    if (!text) return 'No insights available.';
    const lower = text.toLowerCase();
    const motifs = ['flight', 'water', 'teeth', 'falling', 'chase', 'exam', 'crowd'];
    const hits = motifs.filter((m) => lower.includes(m));
    const tone = lower.includes('calm') || lower.includes('peace') ? 'calm' : lower.includes('anx') ? 'anxious' : 'mixed';
    return `Tone: ${tone}. Notable motifs: ${hits.length ? hits.join(', ') : 'none spotted'}.`;
  };

  try {
    const prompt = `You are a concise dream summarizer. Reply ONLY with JSON like {"title":"...","insights":"..."}.
Dream content:
${content}

Rules:
- Title: max 8 words, evocative, no quotes/emojis.
- Insights: 1 short sentence on tone + key motifs, under 180 characters.
- JSON only, no prose, no code fences.`;

    const model = 'gemini-2.5-flash';
    const ai = await getGeminiClient(apiKey);
    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      config: { temperature: 0.4, maxOutputTokens: 220 }
    });

    const raw = await extractGeminiText(result);

    let aiTitle = fallbackTitle(content);
    let aiInsights = fallbackInsights(content);

    if (raw) {
      try {
        const cleaned = raw
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        aiTitle = parsed.title?.trim() || aiTitle;
        aiInsights = parsed.insights?.trim() || aiInsights;
      } catch (err) {
        console.warn('Gemini JSON parse failed, using fallback', err, raw);
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: aiTitle,
        insights: aiInsights,
        debug: {
          keyPresent: true,
          provider: 'gemini',
          raw,
          envSeen: true,
          model,
          sdk: '@google/genai'
        }
      })
    };
  } catch (err) {
    console.error('AI call failed', err?.response?.status, err?.message, err?.response?.data);

    // Gracefully fall back so the app still shows something.
    const title = fallbackTitle(content);
    const insights = fallbackInsights(content);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        insights,
        debug: {
          keyPresent: !!apiKey,
          error: err?.message || 'unknown error',
          status: err?.response?.status || null
        }
      })
    };
  }
};
