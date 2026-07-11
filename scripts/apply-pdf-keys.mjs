// Patch src/data/songs.json keys with the REAL keys extracted from the
// worship-team's sheet PDF (scripts/pdf-keys.json).
//
// The live catalog was generated from source-all.txt, whose keys are
// best-effort ESTIMATES; pdf-keys.json holds the actual keys of the sheets the
// team plays from. For every catalog song whose (normalized) title uniquely
// matches a PDF entry, replace its keys with the PDF keys. Songs the PDF
// doesn't cover are left untouched.
//
// Re-runnable: safe to execute again after any catalog regeneration.
// Usage: node scripts/apply-pdf-keys.mjs [--dry]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(__dirname, "../src/data/songs.json");
const PDF = resolve(__dirname, "pdf-keys.json");
const dry = process.argv.includes("--dry");

// same normalization the curated pipeline uses to match PDF titles
const keyNorm = (t) =>
  String(t).replace(/\([^)]*\)/g, "").replace(/[0-9]/g, "").replace(/[\s,+\-#./]/g, "").toLowerCase();

const KEY_ORDER = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const sortKeys = (keys) => [...keys].sort((a, b) => KEY_ORDER.indexOf(a) - KEY_ORDER.indexOf(b));

const pdfMap = new Map(
  Object.entries(JSON.parse(readFileSync(PDF, "utf8"))).map(([k, v]) => [keyNorm(k), v])
);
const doc = JSON.parse(readFileSync(JSON_PATH, "utf8"));

// two catalog songs collapsing to one normalized title (e.g. an original and a
// "(위러브 Ver.)" variant) can't be told apart in the PDF — skip both, report
const counts = new Map();
for (const s of doc.songs) {
  const n = keyNorm(s.title);
  counts.set(n, (counts.get(n) ?? 0) + 1);
}

let changed = 0, same = 0, notInPdf = 0, skipped = 0;
for (const s of doc.songs) {
  const n = keyNorm(s.title);
  const real = pdfMap.get(n);
  if (!real) { notInPdf++; continue; }
  if ((counts.get(n) ?? 0) > 1) { skipped++; console.log(`  (건너뜀: 제목 중복 매칭) ${s.title}`); continue; }
  const cur = sortKeys(s.keys).join(" ");
  const next = sortKeys(real).join(" ");
  if (cur === next) { same++; continue; }
  console.log(`  ${s.title}: ${cur || "(없음)"} → ${next}`);
  s.keys = sortKeys(real);
  changed++;
}

console.log(`\n총 ${doc.songs.length}곡 | 이미 일치 ${same} | 교정 ${changed} | PDF에 없음 ${notInPdf} | 중복매칭 건너뜀 ${skipped}`);

if (!dry && changed) {
  writeFileSync(JSON_PATH, JSON.stringify(doc, null, 2) + "\n");
  console.log("src/data/songs.json 갱신 완료");
}
