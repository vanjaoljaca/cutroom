export function wrapTextForCanvas(text: string, fontSize: number, maxWidth: number, canvasWidth: number): WrappedText {
  const padding = fontSize * horizontalPaddingEm;
  const available = Math.max(fontSize, canvasWidth * maxWidth - padding * 2);
  const lines = text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, fontSize, available));
  return { text: lines.join("\n"), lines, padding, available, widestLine: Math.max(0, ...lines.map((line) => estimatedTextWidth(line, fontSize))) };
}

export function estimatedTextWidth(text: string, fontSize: number) {
  return [...text].reduce((width, glyph) => width + glyphWidth(glyph) * fontSize, 0);
}

function wrapParagraph(text: string, fontSize: number, available: number) {
  const words = text.trim().split(/\s+/).filter(Boolean); if (!words.length) return [""];
  return words.reduce<string[]>((lines, word) => appendWord(lines, word, fontSize, available), []);
}

function appendWord(lines: string[], word: string, fontSize: number, available: number) {
  const current = lines.at(-1) || ""; const candidate = current ? `${current} ${word}` : word;
  if (estimatedTextWidth(candidate, fontSize) <= available) return [...lines.slice(0, -1), candidate];
  if (estimatedTextWidth(word, fontSize) <= available) return [...lines, word];
  return [...lines, ...breakWord(word, fontSize, available)];
}

function breakWord(word: string, fontSize: number, available: number) {
  return [...word].reduce<string[]>((pieces, glyph) => { const current = pieces.at(-1) || ""; return estimatedTextWidth(current + glyph, fontSize) <= available ? [...pieces.slice(0, -1), current + glyph] : [...pieces, glyph]; }, []);
}

function glyphWidth(glyph: string) {
  if (glyph === " ") return 0.28;
  if (glyph === "…") return 0.9;
  if (/[ilI1.,'!:;]/.test(glyph)) return 0.27;
  if (/[mwMW@#%&]/.test(glyph)) return 0.82;
  if (/[A-Z0-9]/.test(glyph)) return 0.62;
  if (/[a-z]/.test(glyph)) return 0.52;
  return glyph.codePointAt(0)! > 0x2fff ? 1 : 0.62;
}

export type WrappedText = { text: string; lines: string[]; padding: number; available: number; widestLine: number };
const horizontalPaddingEm = 0.36;
