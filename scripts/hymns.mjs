// Marks/added 찬송가(hymns) from scripts/source-hymns.txt onto src/data/songs.json.
// Existing songs whose title matches a hymn are flagged isHymn:true and get the
// hymn's keys/tempos; hymns with no existing match are appended as new entries.
//   node scripts/hymns.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const SONGS = path.join(root, "src/data/songs.json");
const SRC = path.join(dir, "source-hymns.txt");

const TEMPO = { "빠른곡": "FAST", "미디움": "MEDIUM", "느린곡": "SLOW" };
const norm = (t) => t.replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "").toLowerCase();

// 새로 추가되는 찬송가의 주제 분류 (파일 번호 기준). 가사 내용으로 6개 주제 중 하나로 분류.
// 이미 곡 데이터에 있던 찬송가는 기존 주제를 그대로 둡니다.
const THEME_BY_NO = {
  1: "경배와 찬양", 2: "경배와 찬양", 4: "경배와 찬양", 5: "경배와 찬양", 6: "경배와 찬양",
  11: "회개와 고백", 14: "선교와 승리", 15: "선교와 승리", 16: "선교와 승리", 17: "선교와 승리",
  18: "선교와 승리", 19: "회개와 고백", 20: "경배와 찬양", 22: "선교와 승리", 23: "회개와 고백",
  24: "선교와 승리", 25: "경배와 찬양", 27: "기도와 간구", 28: "회개와 고백", 29: "축복과 교제",
  30: "선교와 승리", 31: "선교와 승리", 32: "선교와 승리", 33: "경배와 찬양", 34: "경배와 찬양",
  35: "경배와 찬양", 38: "축복과 교제", 39: "회개와 고백", 44: "은혜와 사랑", 53: "축복과 교제",
  55: "회개와 고백", 56: "경배와 찬양", 58: "경배와 찬양", 60: "은혜와 사랑", 61: "은혜와 사랑",
  63: "은혜와 사랑", 64: "축복과 교제", 66: "은혜와 사랑", 69: "은혜와 사랑", 73: "은혜와 사랑",
  76: "회개와 고백", 77: "기도와 간구", 78: "경배와 찬양", 87: "기도와 간구", 89: "은혜와 사랑",
  90: "회개와 고백", 91: "회개와 고백", 93: "회개와 고백", 95: "경배와 찬양", 96: "기도와 간구",
  97: "은혜와 사랑", 98: "선교와 승리", 99: "경배와 찬양", 100: "축복과 교제",
};

// --- parse the uploaded hymn list, grouping repeated titles (union keys/tempos) ---
const lines = fs.readFileSync(SRC, "utf8").split("\n").map((l) => l.trim());
const hymns = new Map(); // normTitle -> { no, title, keys:Set, tempos:Set }
for (const l of lines) {
  const m = l.match(/^(\d+)\.\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)$/);
  if (!m) continue;
  const [, no, title, keysRaw, tempoRaw] = m;
  const tempo = TEMPO[tempoRaw.trim()];
  if (!tempo) throw new Error(`Unknown tempo: ${tempoRaw}`);
  const keys = keysRaw.split(",").map((k) => k.trim()).filter(Boolean);
  const k = norm(title);
  if (!hymns.has(k)) hymns.set(k, { no: Number(no), title: title.trim(), keys: new Set(), tempos: new Set() });
  const h = hymns.get(k);
  keys.forEach((x) => h.keys.add(x));
  h.tempos.add(tempo);
}

const TEMPO_ORDER = ["FAST", "MEDIUM", "SLOW"];
const sortTempos = (set) => TEMPO_ORDER.filter((t) => set.has(t));

const db = JSON.parse(fs.readFileSync(SONGS, "utf8"));
const byTitle = new Map();
for (const s of db.songs) {
  const k = norm(s.title);
  if (!byTitle.has(k)) byTitle.set(k, s);
}

let updated = 0, added = 0;
const newSongs = [];
for (const [k, h] of hymns) {
  const keys = [...h.keys];
  const tempos = sortTempos(h.tempos);
  const existing = byTitle.get(k);
  if (existing) {
    existing.isHymn = true;
    existing.keys = keys;
    existing.tempos = tempos;
    updated++;
  } else {
    newSongs.push({
      id: "h_" + String(h.no).padStart(3, "0"),
      title: h.title,
      keys,
      tempos,
      themes: THEME_BY_NO[h.no] ? [THEME_BY_NO[h.no]] : [],
      hymnNo: null,
      isHymn: true,
    });
    added++;
  }
}

db.songs = [...db.songs, ...newSongs];
db.generatedAt = db.generatedAt; // unchanged stamp; data edited in place
fs.writeFileSync(SONGS, JSON.stringify(db, null, 2) + "\n");

console.log(`Hymns in source: ${hymns.size} unique titles`);
console.log(`Updated existing songs: ${updated}`);
console.log(`Added new hymn songs:  ${added}`);
console.log(`Total songs now:       ${db.songs.length}`);
