# 무한항로

OpenAI GameBuilders 2026 본선용 클라이언트 게임 데모입니다.

무한한 우주를 항해하며 소수의 강적을 부품 단위로 해체하고, 회수한 `+`, `×` 부품을 우주선에 연결해 OVERFLOW를 만드는 탑뷰 로그라이트입니다.

## 실행

```bash
npm install
npm run dev
```

- 이동: PC는 `WASD` 또는 방향키, 모바일은 화면 왼쪽 아래를 눌러 나타나는 가상 스틱
- 집중 조준: 적 부품 클릭 또는 탭
- 공격: 자동

우주선은 항상 화면 중앙에 고정되고 주변 우주가 스크롤합니다. 방향 전환 시 화면이 아니라 선체만 회전합니다.

## 검증

```bash
npm test
npm run build
```

## 데이터 저장

백엔드는 사용하지 않습니다. 스크랩·발견·승리 기록과 마지막 클로킹 시점의 위치·탐색도·부품 슬롯만 브라우저 `localStorage`의 `overflow-far-space-save-v1` 키에 저장합니다.

## Vercel 배포

Vite 프로젝트이므로 Vercel에서 저장소를 가져오면 프레임워크와 빌드 설정을 자동 감지합니다.

- Build Command: `npm run build`
- Output Directory: `dist`

게임 기획은 [`docs/game-design.md`](docs/game-design.md)에서 확인할 수 있습니다.
