// Curated catalog: widely-sung Korean worship songs (2000–present).
//
// NOTE: This is a best-effort curation from general knowledge, NOT an official
// ranking. Keys are *representative* estimates (worship songs are transposed per
// arrangement); tempo/theme are more stable. Refine freely in-app or here.
//
// Row format: [title, tempo, keys, themes]
//   tempo: FAST | SLOW | MEDIUM
//   keys:  space-separated (e.g. "A" or "A E")
//   themes: from THEMES below, "|"-separated
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/songs.json");

const THEMES = [
  "감사", "찬양(빠른곡)", "찬양(느린곡)", "경배", "말씀", "결단과 헌신",
  "하나님", "성령", "예수", "십자가", "보혈", "영광", "은혜", "사랑",
  "간구", "고백", "치유", "인도와 보호", "선교", "영적전쟁", "교제",
];
const KEY_ORDER = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const TEMPO_ORDER = ["FAST", "SLOW", "MEDIUM"];

// prettier-ignore
const ROWS = [
  // ── 경배 · 임재 (worship / presence) ──
  ["주의 임재 앞에서", "SLOW", "A", "경배|고백"],
  ["주께 가까이 날 이끄소서", "SLOW", "A", "간구|경배"],
  ["거룩하신 하나님", "SLOW", "A", "경배|하나님"],
  ["우리 보좌 앞에 모였네", "SLOW", "A", "경배|영광"],
  ["주의 보좌로 나아갈 때에", "MEDIUM", "E", "경배"],
  ["주 보좌로부터", "SLOW", "G", "경배|영광"],
  ["주 발 앞에 나 엎드려", "SLOW", "A", "경배|고백"],
  ["주 앞에 무릎 꿇고", "SLOW", "G", "경배|고백"],
  ["주께 가오니", "SLOW", "G", "간구|경배"],
  ["주 사랑 놀라운 그 사랑", "SLOW", "A", "경배|사랑"],
  ["모든 능력과 모든 권세", "SLOW", "A", "경배|영광"],
  ["아름답고 놀라운 주 예수", "SLOW", "A", "경배|예수"],
  ["나 무엇과도 주님을 바꾸지 않으리", "SLOW", "D", "고백|경배"],
  ["내 안에 주를 향한 이 노래", "SLOW", "A", "사랑|고백"],
  ["주의 영광 빛나니", "SLOW", "G", "영광|경배"],
  ["주님의 영광 나타나셨네", "SLOW", "G", "영광|경배"],
  ["보혈을 지나", "SLOW", "G", "보혈|경배"],

  // ── 찬양 빠른곡 (upbeat praise) ──
  ["왕이신 나의 하나님", "FAST", "F", "찬양(빠른곡)|하나님|경배"],
  ["성령이 오셨네", "FAST", "C", "성령|찬양(빠른곡)"],
  ["왕 되신 주께 감사하세", "FAST", "G", "감사|찬양(빠른곡)"],
  ["주님 한 분만으로", "FAST", "G", "고백|경배"],
  ["온 맘 다해", "FAST", "F", "찬양(빠른곡)|경배"],
  ["춤추는 사자처럼", "FAST", "A", "찬양(빠른곡)|영적전쟁"],
  ["기뻐하며 승리의 노래", "FAST", "E", "찬양(빠른곡)|영광"],
  ["왕의 왕 주의 주", "FAST", "G", "찬양(빠른곡)|경배"],
  ["주 이름 큰 능력 있도다", "FAST", "C", "찬양(빠른곡)|예수"],
  ["영광의 주님 찬양하세", "FAST", "A", "찬양(빠른곡)|영광"],
  ["위대하신 주", "MEDIUM", "Bb", "찬양(빠른곡)|하나님"],
  ["광대하신 주", "FAST", "A", "찬양(빠른곡)|하나님"],
  ["마지막 날에", "FAST", "G", "찬양(빠른곡)|선교"],
  ["예수 열방의 소망", "FAST", "A", "선교|예수"],
  ["일어나라 빛을 발하라", "FAST", "A", "선교|결단과 헌신"],
  ["주 임재하시는 곳에", "FAST", "F", "성령|경배"],
  ["하늘이 열리고", "FAST", "A", "찬양(빠른곡)|경배"],
  ["주의 이름 높이며", "FAST", "G", "찬양(빠른곡)|영광"],
  ["주를 높이기 원합니다", "FAST", "G", "경배|고백"],
  ["나는 주님을 찬양하리라", "FAST", "F", "찬양(빠른곡)"],
  ["주 예수 기뻐 찬양해", "FAST", "F", "찬양(빠른곡)|예수"],
  ["여호와를 즐거이 불러", "FAST", "E", "찬양(빠른곡)|감사"],
  ["주 신실하심 놀라워", "FAST", "G", "찬양(빠른곡)|고백"],

  // ── 은혜 · 구원 (grace / salvation) ──
  ["은혜", "SLOW", "A", "은혜|고백"],
  ["하나님의 은혜", "SLOW", "D", "은혜|고백"],
  ["주 은혜임을", "SLOW", "D", "은혜|고백"],
  ["내 평생 사는 동안", "MEDIUM", "D", "감사|고백"],
  ["나 같은 죄인 살리신", "SLOW", "G", "은혜|구원"],
  ["주의 은혜라", "SLOW", "A", "은혜|고백"],
  ["놀라운 주의 사랑", "SLOW", "A", "은혜|사랑"],
  ["죄에서 자유를 얻게 함은", "MEDIUM", "A", "보혈|은혜"],

  // ── 십자가 · 보혈 (cross / blood) ──
  ["십자가 그 사랑", "SLOW", "G", "십자가|보혈"],
  ["십자가를 질 수 있나", "SLOW", "G", "십자가|결단과 헌신"],
  ["주 달려 죽은 십자가", "SLOW", "F", "십자가|보혈"],
  ["주 보혈 날 정결케 하고", "SLOW", "G", "보혈|십자가"],
  ["예수 나를 위하여", "SLOW", "E", "십자가|예수"],
  ["갈보리 십자가의 사랑", "SLOW", "D", "십자가|사랑"],
  ["주 십자가를 지심으로", "SLOW", "A", "십자가|보혈"],

  // ── 예수 (Jesus) ──
  ["예수 우리 왕이여", "SLOW", "A", "예수|경배"],
  ["예수 나의 첫사랑 되시네", "SLOW", "A", "예수|사랑"],
  ["살아계신 주", "SLOW", "A", "예수|고백"],
  ["예수 나의 좋은 치료자", "SLOW", "A", "치유|예수"],
  ["예수는 나의 힘이요", "MEDIUM", "F", "예수|고백"],
  ["오직 예수", "MEDIUM", "G", "예수|결단과 헌신"],
  ["예수 메시야", "FAST", "G", "예수|찬양(빠른곡)"],
  ["주 예수 보다 더 귀한 것은 없네", "SLOW", "C", "예수|고백"],
  ["예수 그 이름", "SLOW", "D", "예수|경배"],

  // ── 사랑 · 고백 · 헌신 (love / confession / devotion) ──
  ["사랑합니다 나의 예수님", "SLOW", "A", "사랑|고백"],
  ["주님 다시 오실 때까지", "MEDIUM", "D", "결단과 헌신|선교"],
  ["나의 안에 거하라", "SLOW", "A", "말씀|고백"],
  ["주만 바라볼지라", "MEDIUM", "A", "인도와 보호|고백"],
  ["약할 때 강함 되시네", "SLOW", "F", "고백|은혜"],
  ["주 안에 있는 나에게", "MEDIUM", "G", "고백|인도와 보호"],
  ["내가 주인 삼은", "MEDIUM", "G", "결단과 헌신|고백"],
  ["주님 마음 내게 주소서", "SLOW", "G", "간구|고백"],
  ["주님을 보게 하소서", "SLOW", "G", "간구|고백"],
  ["주를 향한 나의 사랑을", "SLOW", "E", "사랑|고백"],
  ["부르신 곳에서", "MEDIUM", "E", "결단과 헌신|선교"],
  ["주님 뜻대로 살기로 했네", "MEDIUM", "D", "결단과 헌신|고백"],
  ["전심으로", "SLOW", "E", "고백|경배"],
  ["나의 모습 나의 소유", "SLOW", "F", "결단과 헌신|고백"],
  ["내 평생에 가는 길", "SLOW", "D", "고백|인도와 보호"],
  ["내 영혼이 잠잠히", "SLOW", "A", "고백|간구"],
  ["주께 가오니 나를 받으소서", "SLOW", "G", "결단과 헌신|간구"],
  ["나 주의 도움 받고자", "MEDIUM", "D", "간구|고백"],
  ["주님과 같이", "SLOW", "F", "고백|인도와 보호"],

  // ── 감사 (thanksgiving) ──
  ["주님께 감사해", "FAST", "A", "감사"],
  ["날 구원하신 주 감사", "MEDIUM", "A", "감사|은혜"],
  ["감사해 시험이 닥쳐올 때에", "MEDIUM", "C", "감사|고백"],
  ["감사로 제사를 드리는 자가", "MEDIUM", "D", "감사"],
  ["감사와 찬양 드리며", "FAST", "D", "감사|찬양(빠른곡)"],

  // ── 성령 (Holy Spirit) ──
  ["성령의 불타는 교회", "FAST", "G", "성령|교제"],
  ["오소서 진리의 성령님", "SLOW", "D", "성령|간구"],
  ["성령이여 내 영혼을", "SLOW", "D", "성령|간구"],
  ["성령이여 임하소서", "SLOW", "A", "성령|간구"],
  ["주의 성령이 이곳에 임하여", "SLOW", "E", "성령|경배"],

  // ── 하나님 · 아버지 (God / Father) ──
  ["아버지 사랑 내가 노래해", "MEDIUM", "F", "하나님|사랑"],
  ["아버지 사랑합니다", "SLOW", "A", "하나님|사랑"],
  ["창조의 아버지", "MEDIUM", "G", "하나님|경배"],
  ["좋으신 하나님 인자와 자비", "MEDIUM", "E", "하나님|감사"],
  ["전능하신 나의 주 하나님은", "MEDIUM", "A", "하나님|찬양(빠른곡)"],
  ["주 하나님 독생자 예수", "SLOW", "A", "하나님|십자가"],
  ["하나님은 너를 지키시는 자", "MEDIUM", "E", "인도와 보호|하나님"],

  // ── 영광 (glory) ──
  ["영광을 돌리세", "MEDIUM", "G", "영광|경배"],
  ["영광 영광 왕께 영광", "FAST", "G", "영광|찬양(빠른곡)"],
  ["주의 영광 이곳에 가득해", "SLOW", "A", "영광|경배"],

  // ── 말씀 (word) ──
  ["주 말씀 내 발의 등이요", "MEDIUM", "F", "말씀|인도와 보호"],
  ["주님 말씀하시면", "MEDIUM", "D", "말씀|결단과 헌신"],

  // ── 치유 · 위로 · 인도 (healing / comfort / guidance) ──
  ["내 잔이 넘치나이다", "SLOW", "C", "치유|감사"],
  ["주가 보이신 생명의 길", "SLOW", "A", "인도와 보호|고백"],
  ["마음이 상한 자를", "SLOW", "F", "치유|위로"],
  ["주 안에 우리 하나 되어", "MEDIUM", "F", "교제|결단과 헌신"],
  ["주 음성 외에는", "SLOW", "G", "인도와 보호|고백"],
  ["나의 가는 길", "SLOW", "G", "인도와 보호|고백"],
  ["내 영혼의 그윽이 깊은 데서", "SLOW", "Bb", "치유|고백"],
  ["주 안에 거하는 너", "MEDIUM", "D", "인도와 보호|말씀"],
  ["주님께서 다스리네", "FAST", "D", "영광|찬양(빠른곡)"],

  // ── 선교 · 나라 · 영적전쟁 (mission / kingdom / spiritual warfare) ──
  ["부흥", "SLOW", "A", "선교|간구"],
  ["이 땅의 황무함을 보소서", "SLOW", "G", "선교|간구"],
  ["이 땅에 오직 주밖에 없네", "MEDIUM", "F", "선교|고백"],
  ["모든 민족과 방언들 가운데", "MEDIUM", "G", "선교|영광"],
  ["세상 모든 민족이", "FAST", "G", "선교|찬양(빠른곡)"],
  ["문들아 머리 들어라", "FAST", "G", "영적전쟁|경배"],
  ["보라 너희는 두려워 말고", "MEDIUM", "A", "영적전쟁|인도와 보호"],
  ["주 다스리네", "FAST", "D", "영광|영적전쟁"],
  ["이 산지를 내게 주소서", "FAST", "A", "선교|결단과 헌신"],
  ["주님 나라 위하여", "MEDIUM", "D", "선교|결단과 헌신"],

  // ── 교제 · 모임 (fellowship) ──
  ["우리 모일 때 주 성령 임하리", "MEDIUM", "D", "교제|성령"],
  ["당신은 사랑받기 위해 태어난 사람", "MEDIUM", "D", "교제|사랑"],
  ["축복합니다", "MEDIUM", "C", "교제|간구"],
  ["주 안에서 우리 하나 되니", "MEDIUM", "F", "교제|결단과 헌신"],

  // ── 송축 · 현대 회중곡 (modern congregational) ──
  ["송축해 내 영혼", "MEDIUM", "G", "찬양(느린곡)|경배"],
  ["주의 신실하심", "SLOW", "G", "고백|은혜"],
  ["나의 반석이신 하나님", "SLOW", "A", "고백|하나님"],
  ["주의 집에 영광이 가득해", "FAST", "A", "찬양(빠른곡)|영광"],
  ["지금은 엘리야 때처럼", "FAST", "A", "영적전쟁|선교"],
  ["주 하나님 지으신 모든 세계", "SLOW", "A", "경배|하나님"],
  ["나의 영혼이 주를 찬양", "SLOW", "D", "찬양(느린곡)|고백"],
  ["오직 주의 사랑에 매여", "SLOW", "D", "사랑|고백"],
  ["주의 인자는 끝이 없고", "SLOW", "D", "은혜|고백"],
  ["은혜로다", "SLOW", "G", "은혜|고백"],
  ["주 예수의 이름 높이세", "FAST", "G", "예수|찬양(빠른곡)"],
  ["주를 찬양하며", "FAST", "F", "찬양(빠른곡)|경배"],
  ["주의 임재 안에 우리 모였네", "SLOW", "E", "경배|교제"],
  ["주의 사랑을 주의 선하심을", "MEDIUM", "D", "감사|은혜"],
  ["주를 앙모하는 자", "MEDIUM", "A", "인도와 보호|고백"],

  // ── 추가: 폭넓게 불리는 곡 (more standards) ──
  ["빛 되신 주", "MEDIUM", "E", "경배|성령"],
  ["주의 자비가 내려와", "SLOW", "D", "은혜|경배"],
  ["주 예수 이름 높이어", "FAST", "E", "예수|찬양(빠른곡)"],
  ["만유의 주재", "SLOW", "A", "경배|영광"],
  ["호산나", "MEDIUM", "E", "경배|예수"],
  ["거룩하신 전능의 주", "MEDIUM", "G", "경배|하나님"],
  ["그의 생각", "SLOW", "E", "고백|사랑"],
  ["영원한 생명의 주님", "SLOW", "G", "예수|고백"],
  ["하늘과 땅 모두 즐거워하라", "FAST", "G", "찬양(빠른곡)|영광"],
  ["완전하신 나의 주", "SLOW", "F", "경배|고백"],
  ["주를 위한 이곳에", "MEDIUM", "D", "경배|결단과 헌신"],
  ["예수 안에 소망 있네", "MEDIUM", "D", "예수|고백"],
  ["주의 임재 앞에 잠잠해", "SLOW", "A", "경배|고백"],
  ["모든 상황 속에서", "MEDIUM", "A", "고백|인도와 보호"],
  ["내 구주 예수를 더욱 사랑", "SLOW", "D", "사랑|고백"],
  ["예수 사랑하심은", "SLOW", "C", "예수|사랑"],
  ["빈 들에 마른 풀 같이", "MEDIUM", "G", "성령|간구"],
  ["정결하게 하는 샘이", "SLOW", "A", "보혈|십자가"],
  ["나의 갈 길 다 가도록", "SLOW", "G", "인도와 보호|고백"],
  ["주 안에 새 생명 있네", "MEDIUM", "C", "고백|은혜"],
  ["주의 친절한 팔에 안기세", "SLOW", "F", "인도와 보호|위로"],
  ["내 영혼아 주를 찬양하라", "MEDIUM", "G", "찬양(느린곡)|고백"],
  ["나의 입술로", "SLOW", "D", "고백|경배"],
];

// de-dupe by normalized title
const norm = (t) => t.replace(/\s+/g, "").toLowerCase();
const seen = new Set();
const songs = [];
for (const [title, tempo, keys, themes] of ROWS) {
  const n = norm(title);
  if (seen.has(n)) continue;
  seen.add(n);
  const songThemes = themes.split("|").filter((t) => THEMES.includes(t));
  songs.push({
    title,
    keys: keys.split(/\s+/).filter(Boolean),
    tempos: [tempo],
    themes: songThemes,
    hymnNo: null,
  });
}

songs.sort((a, b) => a.title.localeCompare(b.title, "ko"));
songs.forEach((s, i) => (s.id = i + 1));

const usedKeys = KEY_ORDER.filter((k) => songs.some((s) => s.keys.includes(k)));
const usedTempos = TEMPO_ORDER.filter((t) => songs.some((s) => s.tempos.includes(t)));
const usedThemes = THEMES.filter((t) => songs.some((s) => s.themes.includes(t)));

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "Curated: widely-sung Korean worship songs 2000–present (keys are estimates)",
  keys: usedKeys,
  tempos: usedTempos,
  themes: usedThemes,
  songs: songs.map((s) => ({
    id: s.id, title: s.title, keys: s.keys, tempos: s.tempos, themes: s.themes, hymnNo: s.hymnNo,
  })),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Wrote ${songs.length} songs -> ${OUT}`);
console.log(`keys: ${usedKeys.join(",")}`);
console.log(`tempos: ${usedTempos.join(",")}`);
console.log(`themes(${usedThemes.length}): ${usedThemes.join(", ")}`);
