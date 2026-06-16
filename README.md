# 찬양 곡 모음 (Worship Leader)

찬양 인도자를 위한 **코드별 · 주제별 · 템포별** 찬양곡 모음 사이트. 모바일 우선,
정적 사이트로 GitHub Pages에 배포됩니다.

## 스택

- React + Vite + TypeScript
- Tailwind CSS (다크모드 지원)
- react-router-dom (HashRouter — Pages 서브경로에서 안전)
- vite-plugin-pwa (오프라인 캐싱 · 설치형 PWA)
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

## 구글 로그인 + 클라우드 저장 (선택, Firebase)

설정하지 않아도 앱은 **localStorage**로 완전히 동작합니다. 아래를 설정하면 **구글 로그인**과
**개인별 Firestore 동기화**(추가한 곡·콘티·즐겨찾기·이력)가 켜집니다.

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성
2. **Authentication → Sign-in method → Google** 사용 설정
3. **Authentication → Settings → 승인된 도메인**에 `csy870617.github.io` 추가
4. **Firestore Database** 생성(프로덕션 모드), 아래 보안 규칙 적용 — 본인 문서만 접근:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. **프로젝트 설정 → 내 앱(웹)** 에서 config 값 확인
6. 로컬 개발: `.env.example` → `.env.local` 로 복사 후 값 입력
7. 배포(GitHub Pages): 저장소 **Settings → Secrets and variables → Actions → Secrets** 에
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
   `VITE_FIREBASE_APP_ID` 추가 → 다음 배포부터 로그인 버튼이 활성화됩니다.

> config 값은 공개되어도 안전한 클라이언트 설정입니다. 실제 보안은 위 Firestore 규칙으로
> 처리되며, 각 사용자는 **자기 데이터만** 읽고 씁니다. 로그인 시 로컬 데이터와 클라우드
> 데이터가 병합된 뒤 동기화됩니다.

## 배포

저장소의 **기본 브랜치**에 푸시하면 `.github/workflows/deploy.yml`이 빌드 후 Pages에
배포합니다(워크플로의 `branches` 목록은 기본 브랜치 이름에 맞춰 두었습니다). 저장소
**Settings → Pages → Source**를 **GitHub Actions**로 한 번 설정하세요.

## 기능

- **둘러보기** — 코드 / 주제 / 템포 축을 한 화면에서 전환, 가나다·최근 사용순 정렬
- **찾기** — 제목 검색 + 코드·템포·주제 조합 필터(AND)
- **콘티(세트리스트) 빌더** — 곡을 담아 순서 구성(위/아래·메모), 곡 사이 **키 연결 표시**,
  **다음 곡 추천**(키가 매끄럽게 이어지는 곡), 링크/텍스트로 **공유**, 공유 링크 불러오기
- **무대 모드** — 콘티를 큰 글씨로, 현재 곡·키 강조, 탭으로 다음 곡 이동
- **즐겨찾기** — 별표로 담아두고 모아 보기(브라우저에 저장)
- **최근 사용 이력** — "예배에 사용함"으로 날짜 기록 → 목록/콘티에 반복 경고 표시
- **곡 상세** — 코드/템포/주제/찬송가 번호, 유튜브 검색 링크, 키가 어울리는 곡
- **다크모드** — 헤더 토글, 시스템 설정 자동 감지
- **오프라인(PWA)** — 한 번 열면 네트워크 없이도 사용·설치 가능

콘티·즐겨찾기·이력·테마는 모두 브라우저 `localStorage`에 저장되며, 콘티 **공유 링크**는
서버 없이 URL 해시에 곡 순서를 인코딩해 전달합니다.

## 데이터 정리

생성기는 두 섹션을 합치며 손으로 입력된 **오타·표기 변형을 자모 단위 편집거리로 자동 병합**
합니다(예: "마음이 상한 자를" ⇄ "마음의 상한 자를"). 서로 다른 곡인데 비슷한 쌍
(예: "기뻐해" vs "기도해")은 `KEEP_SEPARATE` 목록으로 분리 유지합니다.
