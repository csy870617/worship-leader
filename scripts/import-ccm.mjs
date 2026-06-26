// CCM(찬송가가 아닌 곡)을 scripts/source-ccm.txt 로 "완전히" 갱신합니다.
// 형식:  제목 | 템포 | 코드 | 주제   (각 칸은 쉼표로 여러 값)
// - 제목(공백·대소문자 무시, 괄호는 유지)으로 기존 곡과 연결 → id 유지(즐겨찾기·이력 보존)
// - 파일에 없는 기존 CCM 은 삭제, 새 제목은 새 곡으로 추가
// - 찬송가(isHymn)는 건드리지 않습니다.
//   node scripts/import-ccm.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const SONGS = path.join(root, "src/data/songs.json");
const SRC = path.join(dir, "source-ccm.txt");

const TEMPO = { "빠른곡": "FAST", "미디움": "MEDIUM", "느린곡": "SLOW" };
const TEMPO_ORDER = ["FAST", "MEDIUM", "SLOW"];
// 매칭 키: 괄호(버전 표기)는 유지하고 공백·대소문자만 정규화
const strict = (t) => t.replace(/\s+/g, "").toLowerCase();
// 제목에서 안정적인 id 생성(FNV-1a → base36)
const hashId = (t) => {
  let h = 0x811c9dc5;
  const s = strict(t);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "c_" + (h >>> 0).toString(36);
};

const db = JSON.parse(fs.readFileSync(SONGS, "utf8"));

// 기존 CCM 을 제목 → 곡으로 색인 (id 보존용)
const existingCcm = new Map();
for (const s of db.songs) if (!s.isHymn) existingCcm.set(strict(s.title), s);

const lines = fs.readFileSync(SRC, "utf8").split("\n");
const ccm = [];
const seen = new Set();
const usedIds = new Set(db.songs.filter((s) => s.isHymn).map((s) => s.id));
const newKeys = new Set();

for (const raw of lines) {
  const l = raw.trim();
  if (!l || l.startsWith("#")) continue;
  const parts = l.split("|").map((s) => s.trim());
  if (parts.length !== 4) throw new Error(`Bad line (need 4 columns): ${l}`);
  const [title, tempoRaw, keyRaw, themeRaw] = parts;
  if (!title) throw new Error(`Empty title: ${l}`);
  const k = strict(title);
  if (seen.has(k)) throw new Error(`Duplicate title in file: ${title}`);
  seen.add(k);

  const tempos = (tempoRaw ? tempoRaw.split(",") : [])
    .map((t) => t.trim()).filter(Boolean)
    .map((t) => { if (!TEMPO[t]) throw new Error(`Unknown tempo "${t}" in: ${l}`); return TEMPO[t]; });
  tempos.sort((a, b) => TEMPO_ORDER.indexOf(a) - TEMPO_ORDER.indexOf(b));

  const keys = (keyRaw ? keyRaw.split(",") : []).map((x) => x.trim()).filter(Boolean);
  const themes = (themeRaw ? themeRaw.split(",") : []).map((x) => x.trim()).filter(Boolean);
  keys.forEach((x) => { if (!db.keys.includes(x)) newKeys.add(x); });

  const prev = existingCcm.get(k);
  let id = prev ? prev.id : hashId(title);
  while (usedIds.has(id)) id += "x"; // 해시 충돌 방지
  usedIds.add(id);

  const song = { id, title, keys, tempos, themes, hymnNo: prev?.hymnNo ?? null };
  ccm.push(song);
}

// 새로 등장한 코드(예: 단조 Am, Bm)를 데이터 키 목록에 추가
for (const k of newKeys) if (!db.keys.includes(k)) db.keys.push(k);

const hymns = db.songs.filter((s) => s.isHymn);
const removed = [...existingCcm.values()].filter((s) => !seen.has(strict(s.title)));

db.songs = [...ccm, ...hymns];
db.source = "User-edited CSV (source-ccm.txt) + hymns";
fs.writeFileSync(SONGS, JSON.stringify(db, null, 2) + "\n");

const newCount = ccm.filter((s) => !existingCcm.has(strict(s.title))).length;
console.log(`CCM in file:     ${ccm.length}`);
console.log(`  kept (id 유지): ${ccm.length - newCount}`);
console.log(`  new:           ${newCount}`);
console.log(`  removed:       ${removed.length}`);
if (removed.length) removed.forEach((s) => console.log(`    - ${s.title}`));
console.log(`new keys added:  ${[...newKeys].join(", ") || "none"}`);
console.log(`hymns untouched: ${hymns.length}`);
console.log(`total songs:     ${db.songs.length}`);
