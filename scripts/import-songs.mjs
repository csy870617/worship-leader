// Build src/data/songs.json from an edited CSV (round-trip of songs-export.csv).
// Usage: node scripts/import-songs.mjs [path-to.csv]   (default: songs-base.csv)
//
// CSV columns: id, 제목, 코드, 템포, 주제
//   - id   : keep as-is to preserve favorites/conti links; blank → generated from title
//   - 코드 : space- or comma-separated (e.g. "C A Bb")
//   - 템포 : 빠른곡 | 미디움 | 느린곡  (also accepts FAST/MEDIUM/SLOW)
//   - 주제 : comma-separated theme names (see THEMES below)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = resolve(process.cwd(), process.argv[2] || "songs-base.csv");
const OUT = resolve(__dirname, "../src/data/songs.json");

// preferred display order; any extra themes the user introduces are appended
const THEME_ORDER = [
  "감사", "찬양", "찬양(빠른곡)", "찬양(느린곡)", "경배", "말씀", "결단과 헌신",
  "하나님", "성령", "예수", "십자가", "보혈", "영광", "은혜", "사랑",
  "간구", "고백", "치유", "인도와 보호", "선교", "영적전쟁", "교제", "성탄",
];
const KEY_ORDER = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const TEMPO_ORDER = ["FAST", "SLOW", "MEDIUM"];
const TEMPO_FROM = {
  "빠른곡": "FAST", "미디움": "MEDIUM", "미디엄": "MEDIUM", "느린곡": "SLOW",
  FAST: "FAST", MEDIUM: "MEDIUM", SLOW: "SLOW",
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (t) => t.replace(/\s+/g, "").toLowerCase();
const hashId = (n) => {
  let h = 5381;
  for (const ch of n) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return "b_" + h.toString(36);
};

const text = readFileSync(IN, "utf8").replace(/^﻿/, "");
const rows = parseCsv(text);
const header = rows.shift().map((h) => h.trim());
const col = (name) => header.indexOf(name);
const ci = { id: col("id"), title: col("제목"), keys: col("코드"), tempo: col("템포"), themes: col("주제") };
if (ci.title < 0) throw new Error("CSV에 '제목' 열이 없습니다");

const seenIds = new Set();
const warnings = [];
const songs = [];
for (const r of rows) {
  const title = (r[ci.title] || "").trim();
  if (!title) continue;
  let id = (ci.id >= 0 ? r[ci.id] : "").trim();
  if (!id) id = hashId(norm(title));
  if (seenIds.has(id)) id = hashId(norm(title) + "_" + songs.length); // avoid collision
  seenIds.add(id);

  const keys = (r[ci.keys] || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const rawTempo = (r[ci.tempo] || "").trim();
  const tempo = TEMPO_FROM[rawTempo];
  if (rawTempo && !tempo) warnings.push(`알 수 없는 템포 "${rawTempo}" (${title})`);
  // accept the user's themes as-is (this CSV is the source of truth)
  const themes = (r[ci.themes] || "").split(/[,|]/).map((s) => s.trim()).filter(Boolean);

  songs.push({
    id,
    title,
    keys,
    tempos: tempo ? [tempo] : [],
    themes,
    hymnNo: null,
  });
}

songs.sort((a, b) => a.title.localeCompare(b.title, "ko"));

const usedKeys = KEY_ORDER.filter((k) => songs.some((s) => s.keys.includes(k)));
const extraKeys = [...new Set(songs.flatMap((s) => s.keys))].filter((k) => !KEY_ORDER.includes(k));
const usedTempos = TEMPO_ORDER.filter((t) => songs.some((s) => s.tempos.includes(t)));
const allThemes = [...new Set(songs.flatMap((s) => s.themes))];
const usedThemes = [
  ...THEME_ORDER.filter((t) => allThemes.includes(t)),
  ...allThemes.filter((t) => !THEME_ORDER.includes(t)).sort((a, b) => a.localeCompare(b, "ko")),
];

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "User-edited CSV (songs-base.csv)",
  keys: [...usedKeys, ...extraKeys],
  tempos: usedTempos,
  themes: usedThemes,
  songs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Imported ${songs.length} songs from ${IN}`);
console.log(`keys: ${data.keys.join(",")} | tempos: ${usedTempos.join(",")} | themes: ${usedThemes.length}`);
if (warnings.length) {
  console.log(`\n⚠️ ${warnings.length}건 경고:`);
  for (const w of warnings.slice(0, 30)) console.log("  - " + w);
}
