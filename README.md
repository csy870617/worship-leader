# 찬양 곡 모음 (Worship Leader)

찬양 인도자를 위한 **코드별 · 주제별 · 템포별** 찬양곡 모음 사이트. 모바일 우선,
정적 사이트로 GitHub Pages에 배포됩니다.

## 스택

- React + Vite + TypeScript
- Tailwind CSS
- react-router-dom (HashRouter — Pages 서브경로에서 안전)
- GitHub Actions → GitHub Pages 배포

## 데이터

곡 데이터는 구글시트를 한 번 CSV로 가져와 **정적 스냅샷**으로 저장합니다.

- 원본: `scripts/source-song.csv` (시트 스냅샷)
- 생성기: `scripts/generate-songs.mjs`
- 결과: `src/data/songs.json`

시트는 손으로 관리되는 2개 그리드 섹션으로 구성됩니다.

1. **코드 × 템포** — 코드(C/D/E/F/G/A/Bb) × 템포(빠른곡/느린곡/미디움/찬송가)
2. **주제 × 코드** — 21개 주제(감사·경배·예수·십자가 등) × 코드

생성기는 제목을 정규화(괄호·공백 제거)해 두 섹션을 **하나의 곡 카탈로그**로 병합하고,
각 곡에 코드/템포/주제/새찬송가 번호를 합칩니다.

### 시트 갱신 시

```bash
# 1) 시트를 CSV로 내려받아 scripts/source-song.csv 교체
# 2) 스냅샷 재생성
npm run gen
```

## 개발

```bash
npm install
npm run dev      # 로컬 개발 서버
npm run build    # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
```

## 배포

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 빌드 후 Pages에 배포합니다.
저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정하세요.

## 기능

- **코드별 보기** — 코드 칩으로 필터, 한 곡이 여러 코드면 각 코드에 모두 표시
- **주제별 보기** — 21개 주제 칩으로 필터
- **템포별 보기** — 빠른곡/느린곡/미디움/찬송가
- **검색** — 제목·주제·코드·새찬송가 번호
- **곡 상세** — 코드/템포/주제/찬송가 번호, 주제 탭으로 이동
