const MODERATION_GROUPS = [
  {
    category: 'self-harm or suicide language',
    guidance: 'remove references to self-harm or suicide and rewrite with safer emotional wording.',
    patterns: [
      /\bkill yourself\b/i,
      /\bkys\b/i,
      /\bend your life\b/i,
      /\bend it all\b/i,
      /\bself[-\s]?delete\b/i,
      /\bi want to die\b/i,
      /\bdie tonight\b/i,
      /\bself[-\s]?harm\b/i,
      /\bcut myself\b/i,
      /\bcutting\b/i,
      /\boverdose\b/i,
      /\bsuicide\b/i,
    ]
  },
  {
    category: 'sexual violence or coercion',
    guidance: 'remove graphic or coercive sexual references and keep wording non-graphic.',
    patterns: [
      /\brape\b/i,
      /\braped\b/i,
      /\brapist\b/i,
      /\bsexual assault\b/i,
      /\bmolest(?:ed|er|ation)?\b/i,
      /\bforced sex\b/i,
      /\bnon[-\s]?consensual\b/i,
    ]
  },
  {
    category: 'sexual content involving minors',
    guidance: 'remove any references to minors in sexual contexts.',
    patterns: [
      /\bchild porn\b/i,
      /\bcp\b/i,
      /\bc\.s\.a\.m\b/i,
      /\bcsam\b/i,
      /\bminor(?:s)?\s+sex\b/i,
      /\bunderage\s+sex\b/i,
    ]
  },
  {
    category: 'explicit sexual language',
    guidance: 'replace explicit sexual details with non-explicit wording.',
    patterns: [
      /\bblowjob\b/i,
      /\bhandjob\b/i,
      /\bdeepthroat\b/i,
      /\bcum(?:shot|ming)?\b/i,
      /\bsexting\b/i,
      /\bnudes?\b/i,
      /\bporn(?:ography)?\b/i,
      /\bxxx\b/i,
      /\bonlyfans\b/i,
    ]
  },
  {
    category: 'graphic violence or threats',
    guidance: 'remove violent threats or graphic harm language and keep descriptions non-graphic.',
    patterns: [
      /\bshoot(?:ing| up)?\b/i,
      /\bstab(?:bed|bing)?\b/i,
      /\bstrangle\b/i,
      /\bbehead\b/i,
      /\bmurder(?:ed|er)?\b/i,
      /\bmassacre\b/i,
      /\bgenocide\b/i,
      /\bdeath threat\b/i,
      /\bi will kill you\b/i,
      /\bim going to kill you\b/i,
      /\bbomb\b/i,
    ]
  },
  {
    category: 'extremism or hate references',
    guidance: 'remove extremist language and rewrite in respectful, non-hateful terms.',
    patterns: [
      /\bnazi\b/i,
      /\bwhite supremacy\b/i,
      /\bextremist\b/i,
      /\bterrorist\b/i,
      /\bterrorism\b/i,
    ]
  },
  {
    category: 'hard drug references',
    guidance: 'remove drug references or describe the situation in safer, non-promotional terms.',
    patterns: [
      /\bcocaine\b/i,
      /\bcrack\b/i,
      /\bheroin\b/i,
      /\bfentanyl\b/i,
      /\bmeth(?:amphetamine)?\b/i,
      /\bxanax\b/i,
      /\becstasy\b/i,
      /\blsd\b/i,
      /\bketamine\b/i,
    ]
  },
  {
    category: 'exploitation or sex-for-payment language',
    guidance: 'remove exploitation-related content and keep language non-sexual and age-appropriate.',
    patterns: [
      /\bescort service\b/i,
      /\bpay for sex\b/i,
      /\bsex work ad\b/i,
      /\btrafficking\b/i,
    ]
  },
  {
    category: 'abusive or profane language',
    guidance: 'replace profanity and insults with neutral wording.',
    patterns: [
      /\bfuck\b/i,
      /\bfucked\b/i,
      /\bfucking\b/i,
      /\bmotherfucker\b/i,
      /\basshole\b/i,
      /\bbitch\b/i,
      /\bbastard\b/i,
      /\bdick\b/i,
      /\bpussy\b/i,
      /\bslut\b/i,
      /\bwhore\b/i,
      /\bshit\b/i,
      /\bshitty\b/i,
      /\bbullshit\b/i,
    ]
  },
  {
    category: 'spam or scam language',
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

  const primaryGuidance = matches[0]?.guidance || 'edit the wording to be age-appropriate.';
  return `We could not save your ${contentType} because it includes ${categoriesText}. Please ${primaryGuidance} You can share feelings and symbols using non-graphic, respectful language.`;
};

const SAFE_AI_TITLE_FALLBACK = 'Reflective Dream';
const SAFE_AI_INSIGHTS_FALLBACK = 'Some details were removed to keep this summary age-appropriate. Use this as a general reflection only. AI output may be inaccurate and is not medical, mental health, legal, or safety advice.';

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
