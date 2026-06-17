// Generates src/data/songs.json from scripts/source-song.csv
//
// The Google Sheet is a hand-maintained grid with TWO stacked sections:
//   Section 1 (rows 3..): code x tempo grid
//       col 1        = KEY (sticky down the column: C/D/E/F/G/A/Bb)
//       cols 2-3     = FAST,  cols 4-5 = SLOW,  cols 6-7 = MEDIUM,  cols 8-9 = HYMN(찬송가)
//       each non-empty cell is a song title.
//   Section 2 (starts at the row whose col 1 == "감사"): theme x code grid
//       header row labels themes at odd column indices (1,3,5,...)
//       each data row holds (key, title) pairs: key at col N, title at col N+1.
//
// We merge both sections into one song catalog keyed by a normalized title,
// unioning keys / tempos / themes and parsing hymn numbers from the title.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "source-song.csv");
const OUT = resolve(__dirname, "../src/data/songs.json");

// --- minimal RFC4180-ish CSV parser (handles quoted fields with commas) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const KEY_ORDER = ["C", "D", "E", "F", "G", "A", "Bb"];
const TEMPO_ORDER = ["FAST", "SLOW", "MEDIUM", "HYMN"];
const TEMPO_COLS = { FAST: [2, 3], SLOW: [4, 5], MEDIUM: [6, 7], HYMN: [8, 9] };

const cell = (r, i) => (i < r.length ? r[i].trim() : "");

// normalize a title for de-duplication: drop parenthetical notes + all whitespace
const normTitle = (t) =>
  t.replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "").toLowerCase();

// parse "(새찬9)" / "(172)" -> hymn number
function hymnNumber(title) {
  const m = title.match(/[（(]\s*(?:새찬)?\s*(\d{1,3})\s*[)）]/);
  return m ? Number(m[1]) : null;
}

// split a code cell like "E,F" / "D.E" / "A, Bb" / "E/F" into valid key tokens
function parseKeys(raw) {
  if (!raw) return [];
  return raw
    .split(/[,./\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-G][b#]?$/.test(s));
}

const text = readFileSync(SRC, "utf8");
const rows = parseCsv(text);

const themeHdrIdx = rows.findIndex((r) => cell(r, 1) === "감사");
if (themeHdrIdx < 0) throw new Error("theme header row (감사) not found");

/** @type {Map<string,{title:string, variants:Map<string,number>, fromSec1:boolean, keys:Set<string>, tempos:Set<string>, themes:Set<string>, hymnNo:number|null}>} */
const catalog = new Map();

function record(rawTitle, { fromSec1 }) {
  const title = rawTitle.trim();
  const norm = normTitle(title);
  if (!norm) return null;
  let s = catalog.get(norm);
  if (!s) {
    s = {
      title,
      variants: new Map(),
      fromSec1: false,
      keys: new Set(),
      tempos: new Set(),
      themes: new Set(),
      hymnNo: null,
    };
    catalog.set(norm, s);
  }
  // track display-title candidates, preferring section 1 (the master code list)
  const weight = (s.variants.get(title) || 0) + (fromSec1 ? 10 : 1);
  s.variants.set(title, weight);
  if (fromSec1) s.fromSec1 = true;
  const h = hymnNumber(title);
  if (h && !s.hymnNo) s.hymnNo = h;
  return s;
}

// ---- Section 1: code x tempo ----
let curKey = null;
for (let i = 2; i < themeHdrIdx; i++) {
  const r = rows[i];
  const k = cell(r, 1);
  if (k) curKey = k;
  for (const tempo of TEMPO_ORDER) {
    for (const col of TEMPO_COLS[tempo]) {
      const title = cell(r, col);
      if (!title) continue;
      const s = record(title, { fromSec1: true });
      if (curKey) s.keys.add(curKey);
      s.tempos.add(tempo);
    }
  }
}

// ---- Section 2: theme x code ----
const hdr = rows[themeHdrIdx];
const themeCols = []; // { col, theme }
const themeOrder = [];
for (let ci = 1; ci < hdr.length; ci++) {
  const name = hdr[ci].trim();
  if (name) { themeCols.push({ col: ci, theme: name }); themeOrder.push(name); }
}
for (let i = themeHdrIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  for (const { col, theme } of themeCols) {
    const title = cell(r, col + 1);
    if (!title) continue;
    const s = record(title, { fromSec1: false });
    for (const k of parseKeys(cell(r, col))) s.keys.add(k);
    s.themes.add(theme);
  }
}

// ---- merge near-duplicate titles (hand-typed typos across the two sections) ----
// Decompose Hangul to jamo so single-vowel/consonant typos become small edits
// (e.g. "향한" vs "항햔" -> jamo edit distance 2).
const L = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const V = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const T = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
function toJamo(str) {
  let out = "";
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const s = c - 0xac00;
      out += L[Math.floor(s / 588)] + V[Math.floor((s % 588) / 28)];
      const t = s % 28;
      if (t) out += T[t];
    } else out += ch;
  }
  return out;
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// pairs the fuzzy matcher would wrongly merge — distinct songs kept separate
const pairKey = (a, b) => [a, b].sort().join("|");
const KEEP_SEPARATE = new Set(
  [["우리함께기뻐해", "우리함께기도해"]].map(([a, b]) => pairKey(a, b))
);

{
  const items = [...catalog.entries()].map(([norm, s]) => ({
    norm,
    s,
    jamo: toJamo(norm),
  }));
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const merges = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.norm[0] !== b.norm[0]) continue; // same first syllable
      if (KEEP_SEPARATE.has(pairKey(a.norm, b.norm))) continue;
      if (Math.abs(a.jamo.length - b.jamo.length) > 2) continue;
      const minLen = Math.min(a.jamo.length, b.jamo.length);
      if (minLen < 9) continue; // only longer titles, to avoid false merges
      const d = levenshtein(a.jamo, b.jamo);
      if (d > 0 && d <= 2) {
        merges.push([a.s.title, b.s.title, d]);
        parent[find(i)] = find(j);
      }
    }
  }
  // fold each non-root into its root
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    if (r === i) continue;
    const from = items[i].s, into = items[r].s;
    for (const k of from.keys) into.keys.add(k);
    for (const t of from.tempos) into.tempos.add(t);
    for (const th of from.themes) into.themes.add(th);
    for (const [title, w] of from.variants)
      into.variants.set(title, (into.variants.get(title) || 0) + w);
    if (from.fromSec1) into.fromSec1 = true;
    if (from.hymnNo && !into.hymnNo) into.hymnNo = from.hymnNo;
    catalog.delete(items[i].norm);
  }
  if (merges.length) {
    console.log(`merged ${merges.length} near-duplicate title pair(s):`);
    for (const [x, y, d] of merges) console.log(`   "${x}"  ⇄  "${y}"  (d=${d})`);
  }
}

// pick best display title per song (highest weight; tie -> longest)
function bestTitle(s) {
  return [...s.variants.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length
  )[0][0];
}

const keyRank = (k) => {
  const i = KEY_ORDER.indexOf(k);
  return i < 0 ? 99 : i;
};
const tempoRank = (t) => TEMPO_ORDER.indexOf(t);

// stable, title-derived id (so user data survives dataset edits)
const hashId = (n) => {
  let h = 5381;
  for (const ch of n) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return "b_" + h.toString(36);
};

const songs = [...catalog.values()]
  .map((s) => ({
    id: hashId(normTitle(bestTitle(s))),
    title: bestTitle(s),
    keys: [...s.keys].sort((a, b) => keyRank(a) - keyRank(b)),
    tempos: [...s.tempos].sort((a, b) => tempoRank(a) - tempoRank(b)),
    themes: [...s.themes].sort((a, b) => themeOrder.indexOf(a) - themeOrder.indexOf(b)),
    hymnNo: s.hymnNo,
  }))
  .sort((a, b) => a.title.localeCompare(b.title, "ko"));

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "Google Sheet snapshot (1J6ii8ikjdnB1ZnXm_v69uduEBrObz0FT)",
  keys: KEY_ORDER,
  tempos: TEMPO_ORDER,
  themes: themeOrder,
  songs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");

console.log(`Wrote ${songs.length} songs -> ${OUT}`);
console.log(`themes: ${themeOrder.length}, keys: ${KEY_ORDER.length}`);
console.log(`with tempo: ${songs.filter((s) => s.tempos.length).length}, with theme: ${songs.filter((s) => s.themes.length).length}`);
