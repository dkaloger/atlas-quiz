// The book's passage with the label's name and this number's references in bold.

import { esc } from './util.js';

const SUFFIX = { α: 'a', β: 'b', γ: 'c', δ: 'd', ε: 'e' };

/** "11α" and "11A" both read as "11a". */
export const normaliseNumber = (n) => [...n.toLowerCase()].map((c) => SUFFIX[c] ?? c).join('');

/** Lower case without accents, with a map from each folded character back to the original index. */
function fold(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const f = text[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace('ς', 'σ');
    for (const c of f) { out += c; map.push(i); }
  }
  map.push(text.length);
  return { out, map };
}

const isLetter = (c) => /\p{L}/u.test(c);

/**
 * @param also extra words to bold along with the rest of their word ("απόφυση", "αποφύ").
 * @returns HTML
 */
export function highlight(passage, number, name, also = []) {
  const ranges = [];
  const { out, map } = fold(passage);

  const needle = fold(name).out;
  const at = needle ? out.indexOf(needle) : -1;
  if (at >= 0) ranges.push([map[at], map[at + needle.length - 1] + 1]);

  for (const word of also) {
    const w = fold(word).out;
    let from = 0, hit;
    while (w && (hit = out.indexOf(w, from)) >= 0) {
      let end = map[hit + w.length - 1] + 1;
      while (end < passage.length && isLetter(passage[end])) end++;
      ranges.push([map[hit], end]);
      from = hit + w.length;
    }
  }

  // "(Γ12)" with its brackets, then bare codes: "Γ12", "A 12", "12".
  const wanted = normaliseNumber(number);
  const patterns = [
    /\(\s*\p{L}{0,2}\s*(\d+)\s*(\p{L}?)\s*\)/gu,
    /(?<![\p{L}\d])(?:\p{Lu}\s?)?(\d+)(\p{Ll}?)(?![\p{L}\d])/gu,
  ];
  for (const pattern of patterns) {
    for (const m of passage.matchAll(pattern)) {
      if (normaliseNumber(m[1] + m[2]) === wanted) ranges.push([m.index, m.index + m[0].length]);
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  let result = '', cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const s = Math.max(start, cursor);
    result += esc(passage.slice(cursor, s)) + '<strong>' + esc(passage.slice(s, end)) + '</strong>';
    cursor = end;
  }
  return result + esc(passage.slice(cursor));
}
