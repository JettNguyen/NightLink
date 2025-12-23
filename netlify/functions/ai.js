const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  const projectId = process.env.GEMINI_PROJECT_ID;
  if (!projectId) {
    console.error('GEMINI_PROJECT_ID is missing in Netlify environment');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Gemini project ID missing on server',
        debug: {
          keyPresent: true,
          provider: 'gemini',
          projectIdPresent: false,
          hint: 'Set GEMINI_PROJECT_ID in Netlify env to your Google Cloud project ID'
        }
      })
    };
  }

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

    const model = 'gemini-1.5-flash-latest';
    const region = 'us-central1';
    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent?key=${apiKey}`;

    let raw = '';
    let respStatus = null;
    let lastErrorBody = '';

    const resp = await fetch(vertexUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 220 }
      })
    });
    respStatus = resp.status;
    if (!resp.ok) {
      lastErrorBody = await resp.text();
      console.error('Gemini non-200', resp.status, lastErrorBody, 'url', vertexUrl);
      throw new Error(`Gemini error ${resp.status}: ${lastErrorBody}`);
    }

    const json = await resp.json();
    raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
          respStatus,
          model,
          projectId,
          region
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
