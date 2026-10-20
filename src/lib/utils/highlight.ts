export interface TextPiece {
  text: string;
  match: boolean;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Split `text` into plain and matching pieces for a search query, following
 * the same rules as the backend's `matches_search`: every whitespace-separated
 * word counts, in any order, regardless of case — umlauts included.
 */
export const highlightPieces = (text: string, query: string): TextPiece[] => {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0 || !text) return [{ text, match: false }];

  // Longest first, so "änderungen" is marked whole instead of stopping at a
  // shorter term it contains.
  const alternatives = [...terms]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const pattern = new RegExp(`(${alternatives.join("|")})`, "giu");

  // With one capture group, split alternates plain, match, plain, match …
  return text
    .split(pattern)
    .map((piece, index) => ({ text: piece, match: index % 2 === 1 }))
    .filter((piece) => piece.text.length > 0);
};
