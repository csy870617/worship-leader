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
      themes: [],
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
