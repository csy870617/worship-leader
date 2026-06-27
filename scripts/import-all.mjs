// 전체 곡 데이터(CCM + 찬송가)를 scripts/source-all.txt 로 "완전히" 갱신합니다.
// 파일 형식(둘러보기 내보내기와 동일):
//   [CCM] / [찬송가] 섹션 헤더 + "NNN. 제목 | 템포 | 코드 | 주제" 줄
// - 제목(공백·대소문자 무시, 괄호는 유지)으로 기존 곡과 연결 → id 유지(즐겨찾기·이력 보존)
// - 섹션에 따라 isHymn 설정(찬송가=true). 파일에 없는 곡은 삭제, 새 제목은 추가.
//   node scripts/import-all.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const SONGS = path.join(root, "src/data/songs.json");
const SRC = path.join(dir, "source-all.txt");

const TEMPO = { "빠른곡": "FAST", "미디움": "MEDIUM", "느린곡": "SLOW" };
const TEMPO_ORDER = ["FAST", "MEDIUM", "SLOW"];
const strict = (t) => t.replace(/\s+/g, "").toLowerCase();
const hashId = (t) => {
  let h = 0x811c9dc5;
  const s = strict(t);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "c_" + (h >>> 0).toString(36);
};

const db = JSON.parse(fs.readFileSync(SONGS, "utf8"));
const byTitle = new Map(db.songs.map((s) => [strict(s.title), s]));
const keyIndex = new Map(db.keys.map((k, i) => [k, i]));

const lines = fs.readFileSync(SRC, "utf8").split("\n");
let section = null;
const rows = [];
for (const raw of lines) {
  const l = raw.trim();
  if (!l || l.startsWith("#")) continue;
  if (l.startsWith("[CCM]")) { section = "ccm"; continue; }
  if (l.startsWith("[찬송가]")) { section = "hymn"; continue; }
  if (!section) throw new Error(`Line before any section header: ${l}`);
  const body = (l.match(/^\d+\.\s*(.*)$/) || [, l])[1];
  const p = body.split("|").map((s) => s.trim());
  if (p.length !== 4) throw new Error(`Bad line (need 4 columns): ${l}`);
  rows.push({ section, title: p[0], tempoRaw: p[1], keyRaw: p[2], themeRaw: p[3] });
}

const seen = new Set();
const usedIds = new Set();
const newKeys = new Set();
const ccm = [];
const hymns = [];

for (const r of rows) {
  if (!r.title) throw new Error(`Empty title`);
  const k = strict(r.title);
  if (seen.has(k)) throw new Error(`Duplicate title: ${r.title}`);
  seen.add(k);

  const tempos = (r.tempoRaw ? r.tempoRaw.split(",") : []).map((t) => t.trim()).filter(Boolean)
    .map((t) => { if (!TEMPO[t]) throw new Error(`Unknown tempo "${t}" in ${r.title}`); return TEMPO[t]; });
  tempos.sort((a, b) => TEMPO_ORDER.indexOf(a) - TEMPO_ORDER.indexOf(b));
  const keys = (r.keyRaw ? r.keyRaw.split(",") : []).map((x) => x.trim()).filter(Boolean);
  keys.sort((a, b) => (keyIndex.get(a) ?? 99) - (keyIndex.get(b) ?? 99));
  keys.forEach((x) => { if (!db.keys.includes(x)) newKeys.add(x); });
  const themes = (r.themeRaw ? r.themeRaw.split(",") : []).map((x) => x.trim()).filter(Boolean);

  const prev = byTitle.get(k);
  let id = prev ? prev.id : hashId(r.title);
  while (usedIds.has(id)) id += "x";
  usedIds.add(id);

  const song = { id, title: r.title, keys, tempos, themes, hymnNo: prev?.hymnNo ?? null };
  if (r.section === "hymn") { song.isHymn = true; hymns.push(song); } else ccm.push(song);
}

for (const k of newKeys) if (!db.keys.includes(k)) db.keys.push(k);

const removed = db.songs.filter((s) => !seen.has(strict(s.title)));
const reclassified = rows
  .map((r) => ({ r, prev: byTitle.get(strict(r.title)) }))
  .filter(({ r, prev }) => prev && !!prev.isHymn !== (r.section === "hymn"))
  .map(({ r, prev }) => `${r.title}: ${prev.isHymn ? "찬송가" : "CCM"} → ${r.section === "hymn" ? "찬송가" : "CCM"}`);

db.songs = [...ccm, ...hymns];
db.source = "User-edited full list (source-all.txt)";
fs.writeFileSync(SONGS, JSON.stringify(db, null, 2) + "\n");

const newCount = rows.filter((r) => !byTitle.has(strict(r.title))).length;
console.log(`CCM: ${ccm.length} | 찬송가: ${hymns.length} | total: ${db.songs.length}`);
console.log(`kept(id 유지): ${rows.length - newCount} | new: ${newCount} | removed: ${removed.length}`);
removed.forEach((s) => console.log(`  - [${s.isHymn ? "찬송가" : "CCM"}] ${s.title}`));
console.log(`new keys: ${[...newKeys].join(", ") || "none"}`);
console.log(`reclassified: ${reclassified.length ? reclassified.join("; ") : "none"}`);
