const BLOCKED_PATTERNS = [
  /\bkill yourself\b/i,
  /\bself[-\s]?harm\b/i,
  /\bsuicide\b/i,
  /\brape\b/i,
  /\bsexual assault\b/i,
  /\bchild porn\b/i,
  /\bc\.s\.a\.m\b/i,
  /\bnazi\b/i,
  /\bterrorist\b/i,
  /\bfuck\b/i,
  /\bshit\b/i,
];

export const containsBlockedContent = (text = '') => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
};
