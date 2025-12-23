const { OpenAI } = require('openai');

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is missing in Netlify environment');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'AI key missing on server', debug: { keyPresent: false } })
    };
  }

  const client = new OpenAI({ apiKey });

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
    const [titleResp, insightsResp] = await Promise.all([
      client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Short title (max 64 chars) for this dream:\n${content}` }],
        max_tokens: 60,
      }),
      client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `1-2 gentle insights for this dream:\n${content}` }],
        max_tokens: 120,
      })
    ]);

    const title = titleResp.choices[0]?.message?.content?.trim() || 'Untitled dream';
    const insights = insightsResp.choices[0]?.message?.content?.trim() || 'No insights available.';

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, insights, debug: { keyPresent: true } })
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
