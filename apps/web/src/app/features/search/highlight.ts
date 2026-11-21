export interface HighlightPart {
  readonly text: string;
  readonly mark: boolean;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&amp;': '&',
};

const unescape = (text: string) =>
  text.replace(/&(?:lt|gt|quot|amp|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity);

/**
 * Splits a search highlight into plain and matched parts, to render as text nodes
 * and <mark> elements. The API sends the fragment HTML-escaped with <mark> tags
 * around matches; rather than trusting it as HTML ([innerHTML]), only those two
 * tags are recognised and everything else is decoded back into plain text, so a
 * name like "<script>" shows as typed and can never run.
 */
export function highlightParts(fragment: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let mark = false;
  for (const piece of fragment.split(/(<\/?mark>)/)) {
    if (piece === '<mark>' || piece === '</mark>') {
      mark = piece === '<mark>';
    } else if (piece) {
      parts.push({ text: unescape(piece), mark });
    }
  }
  return parts;
}

/** The fragment as plain text, without the marks. */
export function highlightText(fragment: string): string {
  return highlightParts(fragment)
    .map((part) => part.text)
    .join('');
}
