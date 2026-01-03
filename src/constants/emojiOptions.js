const DEFAULT_EMOJIS = [
  '😂', '😭', '🥰', '😨', '😢', '😳', '😲', '😴', '😵‍💫', '‼️', '💫', '🌙', '☀️', '👍', '🙌', '💤'
];

let emojiRegex;
try {
  emojiRegex = new RegExp('\\p{Extended_Pictographic}', 'u');
} catch {
  emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
}

export const COMMON_EMOJI_REACTIONS = DEFAULT_EMOJIS;

export const filterEmojiInput = (value = '') => {
  if (!value) return '';
  const filtered = Array.from(value)
    .filter((char) => emojiRegex.test(char));
  return filtered.slice(-2).join('');
};
