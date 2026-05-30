/**
 * Returns a JSX node with `term` highlighted inside `text`.
 *
 * If the first match falls outside the `windowSize` preview window the window
 * is shifted to centre around the match, with ellipsis prefix/suffix so the
 * reader knows the snippet is not from the start of the content.
 */
export function highlightSnippet(text, term, windowSize = 220) {
  if (!text) return null;

  const trimmed = (term || '').trim();

  if (!trimmed) {
    return text.length > windowSize ? `${text.slice(0, windowSize)}…` : text;
  }

  const lowerText = text.toLowerCase();
  const lowerTerm = trimmed.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerTerm);

  let start = 0;
  let end = Math.min(text.length, windowSize);

  if (matchIndex !== -1 && matchIndex >= windowSize) {
    const half = Math.floor(windowSize / 2);
    start = Math.max(0, matchIndex - half);
    end = Math.min(text.length, start + windowSize);
    start = Math.max(0, end - windowSize);
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const visible = text.slice(start, end);

  if (matchIndex === -1) {
    return <>{prefix}{visible}{suffix}</>;
  }

  const visibleLower = visible.toLowerCase();
  const parts = [];
  let cursor = 0;
  let idx;
  while ((idx = visibleLower.indexOf(lowerTerm, cursor)) !== -1) {
    if (idx > cursor) parts.push(visible.slice(cursor, idx));
    parts.push(
      <mark key={idx} className="search-highlight">
        {visible.slice(idx, idx + lowerTerm.length)}
      </mark>
    );
    cursor = idx + lowerTerm.length;
  }
  if (cursor < visible.length) parts.push(visible.slice(cursor));

  return <>{prefix}{parts}{suffix}</>;
}
