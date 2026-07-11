// Reconcile song keys in songs-base.csv with the REAL keys extracted from the
// worship-team's sheet PDF (scripts/pdf-keys.json). The curated/estimated
// sources guessed keys for many songs; the PDF is ground truth for every song
// it covers. Songs not in the PDF are left untouched.
//
// Usage: node scripts/reconcile-keys.mjs          (writes songs-base.csv)
//        node scripts/reconcile-keys.mjs --dry    (report only)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(__dirname, "../songs-base.csv");
const PDF = resolve(__dirname, "pdf-keys.json");
const dry = process.argv.includes("--dry");

// same normalization the curated pipeline uses to match PDF titles
const keyNorm = (t) =>
  String(t).replace(/\([^)]*\)/g, "").replace(/[0-9]/g, "").replace(/[\s,+\-#./]/g, "").toLowerCase();

const KEY_ORDER = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const sortKeys = (keys) => [...keys].sort((a, b) => KEY_ORDER.indexOf(a) - KEY_ORDER.indexOf(b));

const pdf = JSON.parse(readFileSync(PDF, "utf8"));
const pdfMap = new Map(Object.entries(pdf).map(([k, v]) => [keyNorm(k), v]));

// --- parse CSV (same minimal parser as import-songs.mjs) ---
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
const csvField = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

const text = readFileSync(CSV, "utf8").replace(/^﻿/, "");
const rows = parseCsv(text);
const header = rows.shift();
const iTitle = header.indexOf("제목");
const iKeys = header.indexOf("코드");
if (iTitle < 0 || iKeys < 0) throw new Error("CSV header missing 제목/코드");

// guard: two different catalog rows collapsing to the same normalized title
// would both receive the same PDF keys — skip those and report instead
const counts = new Map();
for (const r of rows) {
  if (!r[iTitle]) continue;
  const n = keyNorm(r[iTitle]);
  counts.set(n, (counts.get(n) ?? 0) + 1);
}

let changed = 0, skippedCollision = 0, notInPdf = 0, same = 0;
for (const r of rows) {
  const title = r[iTitle];
  if (!title) continue;
  const n = keyNorm(title);
  const real = pdfMap.get(n);
  if (!real) { notInPdf++; continue; }
  if ((counts.get(n) ?? 0) > 1) { skippedCollision++; console.log(`  (건너뜀: 제목 중복 매칭) ${title}`); continue; }
  const cur = sortKeys(r[iKeys].split(/[\s,]+/).filter(Boolean)).join(" ");
  const next = sortKeys(real).join(" ");
  if (cur === next) { same++; continue; }
  console.log(`  ${title}: ${cur || "(없음)"} → ${next}`);
  r[iKeys] = next;
  changed++;
}

console.log(`\n총 ${rows.length}곡 | PDF 악보와 일치 ${same} | 교정 ${changed} | PDF에 없음 ${notInPdf} | 중복매칭 건너뜀 ${skippedCollision}`);

if (!dry && changed) {
  const out = "﻿" + [header, ...rows].map((r) => r.map(csvField).join(",")).join("\n") + "\n";
  writeFileSync(CSV, out);
  console.log(`songs-base.csv 갱신 완료 → 'npm run gen'으로 songs.json을 재생성하세요.`);
}
