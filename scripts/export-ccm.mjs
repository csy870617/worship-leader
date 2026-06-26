// CCM(찬송가가 아닌 곡) 목록을 편집 가능한 텍스트로 내보냅니다.
// 형식:  제목 | 템포 | 코드 | 주제   (각 칸은 쉼표로 여러 값)
//   node scripts/export-ccm.mjs > ccm-songs.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const db = JSON.parse(fs.readFileSync(path.join(root, "src/data/songs.json"), "utf8"));

const TEMPO_KO = { FAST: "빠른곡", MEDIUM: "미디움", SLOW: "느린곡" };
const TEMPO_ORDER = ["FAST", "MEDIUM", "SLOW"];
const keyIndex = new Map(db.keys.map((k, i) => [k, i]));

const ccm = db.songs
  .filter((s) => !s.isHymn)
  .sort((a, b) => a.title.localeCompare(b.title, "ko"));

const tempos = (s) =>
  [...s.tempos].sort((a, b) => TEMPO_ORDER.indexOf(a) - TEMPO_ORDER.indexOf(b)).map((t) => TEMPO_KO[t] ?? t).join(", ");
const keys = (s) =>
  [...s.keys].sort((a, b) => (keyIndex.get(a) ?? 99) - (keyIndex.get(b) ?? 99)).join(", ");
const themes = (s) => s.themes.join(", ");

const header = [
  "# CCM 곡 목록 — 한 줄에 한 곡, 칸은 \" | \" 로 구분합니다.",
  "# 형식:  제목 | 템포 | 코드 | 주제",
  "#  - 템포: 빠른곡 / 미디움 / 느린곡           (여러 개면 쉼표, 예: 빠른곡, 미디움)",
  "#  - 코드: C D Eb E F G A Bb B               (여러 개면 쉼표, 예: G, A)",
  "#  - 주제: 경배와 찬양 / 은혜와 사랑 / 회개와 고백 / 기도와 간구 / 축복과 교제 / 선교와 승리",
  "#  - 값이 없으면 칸을 비워 두세요(예:  제목 | 빠른곡 |  | ).",
  "#  - 줄을 지우면 삭제, 새 줄을 추가하면 새 곡으로 추가됩니다.",
  "#  - '#' 로 시작하는 줄은 무시됩니다. 제목으로 기존 곡과 연결되니 제목 변경은 새 곡으로 인식됩니다.",
  `# 총 ${ccm.length}곡 · 가나다순`,
  "",
];

const lines = ccm.map((s) => `${s.title} | ${tempos(s)} | ${keys(s)} | ${themes(s)}`);
process.stdout.write(header.concat(lines).join("\n") + "\n");
