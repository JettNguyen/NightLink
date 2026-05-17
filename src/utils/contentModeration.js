// Content moderation for an 18+ platform.
// We allow mature dream content (violence in dreams, adult themes, profanity)
// but block content that Apple explicitly prohibits or that constitutes abuse:
// CSAM, self-harm promotion, real-world threats, hate group glorification,
// sex trafficking solicitation, and spam/scams.

const MODERATION_GROUPS = [
  {
    category: 'self-harm or suicide promotion',
    guidance: 'remove content that encourages or instructs self-harm. You can express dark feelings without explicit encouragement.',
    patterns: [
      /\bkill yourself\b/i,
      /\bkys\b/i,
      /\bend your life\b/i,
      /\bself[-\s]?delete\b/i,
      /\byou should (?:die|hurt yourself)\b/i,
      /\bhow to (?:kill|hurt) (?:yourself|myself)\b/i,
    ]
  },
  {
    category: 'sexual content involving minors',
    guidance: 'remove any references to minors in sexual contexts.',
    patterns: [
      /\bchild porn\b/i,
      /\bc\.s\.a\.m\b/i,
      /\bcsam\b/i,
      /\bunderage\s+sex\b/i,
      /\bchild\s+(?:sexual|sex)\b/i,
      /\bminor\s+(?:sexual|sex|nude|naked)\b/i,
    ]
  },
  {
    category: 'hate group glorification',
    guidance: 'remove content that promotes or glorifies hate groups or genocidal ideologies.',
    patterns: [
      /\bwhite\s+supremac(?:y|ist)\b/i,
      /\bwhite\s+power\b/i,
      /\bnazi(?:s)?\s+(?:were\s+)?right\b/i,
      /\bgenocide\s+(?:is\s+)?(?:good|great|right|justified)\b/i,
    ]
  },
  {
    category: 'real-world threats or incitement',
    guidance: 'remove direct threats against real people or calls to violence.',
    patterns: [
      /\bi (?:will|am going to) kill you\b/i,
      /\bi (?:will|am going to) (?:shoot|stab|bomb) you\b/i,
      /\bdeath\s+threat\b/i,
      /\bterrorist\s+(?:attack|recruit|manifesto)\b/i,
    ]
  },
  {
    category: 'exploitation or sex trafficking solicitation',
    guidance: 'remove solicitation language.',
    patterns: [
      /\bpay for sex\b/i,
      /\bsex work ad\b/i,
      /\bhuman trafficking\b/i,
      /\bsex trafficking\b/i,
    ]
  },
  {
    category: 'spam or scam solicitation',
    guidance: 'remove solicitation language and links; keep your writing focused on your own dream.',
    patterns: [
      /\bwhatsapp me\b/i,
      /\btelegram me\b/i,
      /\btext me on\b/i,
      /\bguaranteed income\b/i,
      /\bcrypto giveaway\b/i,
      /\binvest now\b/i,
      /\bdouble your money\b/i,
      /\bclick (the )?link\b/i,
      /\bfree money\b/i,
      /\bcash app me\b/i,
    ]
  },
];

const BLOCKED_PATTERNS = MODERATION_GROUPS.flatMap((group) => group.patterns);

const findModerationHits = (text = '') => {
  const normalized = String(text || '').trim();
  if (!normalized) return [];

  const matches = [];
  for (const group of MODERATION_GROUPS) {
    if (group.patterns.some((pattern) => pattern.test(normalized))) {
      matches.push(group);
    }
  }
  return matches;
};

export const containsBlockedContent = (text = '') => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const getModerationFeedback = (text = '', { contentType = 'content', maxCategories = 2 } = {}) => {
  const matches = findModerationHits(text);
  if (!matches.length) return null;

  const categories = matches.slice(0, maxCategories).map((group) => group.category);
  const categoriesText = categories.length === 1
    ? categories[0]
    : `${categories.slice(0, -1).join(', ')} and ${categories[categories.length - 1]}`;

  const primaryGuidance = matches[0]?.guidance || 'edit the wording.';
  return `We could not save your ${contentType} because it includes ${categoriesText}. Please ${primaryGuidance}`;
};

const SAFE_AI_TITLE_FALLBACK = 'Reflective Dream';
const SAFE_AI_INSIGHTS_FALLBACK = 'Some details were removed from this summary. Use this as a general reflection only. AI output may be inaccurate and is not medical, mental health, legal, or safety advice.';

export const sanitizeAiGeneratedContent = ({ title = '', insights = '' } = {}) => {
  const normalizedTitle = String(title || '').trim();
  const normalizedInsights = String(insights || '').trim();

  const titleBlocked = containsBlockedContent(normalizedTitle);
  const insightsBlocked = containsBlockedContent(normalizedInsights);
  const wasFiltered = titleBlocked || insightsBlocked;

  return {
    title: titleBlocked ? SAFE_AI_TITLE_FALLBACK : normalizedTitle,
    insights: insightsBlocked ? SAFE_AI_INSIGHTS_FALLBACK : normalizedInsights,
    wasFiltered,
  };
};
