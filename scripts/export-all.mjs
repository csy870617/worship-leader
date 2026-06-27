// 전체 곡(CCM + 찬송가)을 점검용 텍스트로 내보냅니다. import-all.mjs 로 다시 읽을 수 있습니다.
//   node scripts/export-all.mjs > all-songs.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(fs.readFileSync(path.join(dir, "..", "src/data/songs.json"), "utf8"));

const TEMPO_KO = { FAST: "빠른곡", MEDIUM: "미디움", SLOW: "느린곡" };
const TEMPO_ORDER = ["FAST", "MEDIUM", "SLOW"];
const keyIndex = new Map(db.keys.map((k, i) => [k, i]));
const tempos = (s) => [...s.tempos].sort((a, b) => TEMPO_ORDER.indexOf(a) - TEMPO_ORDER.indexOf(b)).map((t) => TEMPO_KO[t] ?? t).join(", ");
const keys = (s) => [...s.keys].sort((a, b) => (keyIndex.get(a) ?? 99) - (keyIndex.get(b) ?? 99)).join(", ");
const line = (s) => `${s.title} | ${tempos(s)} | ${keys(s)} | ${s.themes.join(", ")}`;
const sortKo = (a, b) => a.title.localeCompare(b.title, "ko");

const ccm = db.songs.filter((s) => !s.isHymn).sort(sortKo);
const hymns = db.songs.filter((s) => s.isHymn).sort(sortKo);

const out = [];
out.push(`# 전체 곡 목록`);
out.push(`# 형식:  제목 | 템포 | 코드 | 주제`);
out.push(`# 총 ${db.songs.length}곡 (CCM ${ccm.length} · 찬송가 ${hymns.length})`);
out.push("");
out.push(`[CCM] (${ccm.length}곡 · 가나다순)`);
ccm.forEach((s, i) => out.push(`${String(i + 1).padStart(3, " ")}. ${line(s)}`));
out.push("");
out.push(`[찬송가] (${hymns.length}곡 · 가나다순)`);
hymns.forEach((s, i) => out.push(`${String(i + 1).padStart(3, " ")}. ${line(s)}`));
process.stdout.write(out.join("\n") + "\n");
