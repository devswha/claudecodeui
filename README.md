<div align="center">
  <img src="public/logo.svg" alt="Gajae App" width="72" height="72">
  <h1>Gajae App</h1>
  <p>GJC 세션을 어디서든 확인하고 원격으로 제어하는 웹·데스크톱 앱</p>
</div>

## 소개

Gajae App은 로컬 또는 원격 환경에서 실행 중인 AI 코딩 에이전트 세션을 한곳에서 관리하기 위한 인터페이스입니다. 대화, 터미널, 파일 탐색, Git 작업을 데스크톱과 모바일 브라우저에서 이어서 사용할 수 있습니다.

Gajae App은 Gajae Code(GJC), Claude Code, Cursor, Codex, OpenCode 세션을 지원하며 로컬 서버와 등록된 원격 서버를 명시적으로 분리해 관리합니다.

## 주요 기능

- 실행 중인 프로젝트와 세션 탐색 및 재개
- 에이전트와 실시간 대화
- 내장 터미널을 통한 CLI 제어
- 파일 탐색, 구문 강조 및 편집
- Git 변경 확인, 스테이징, 커밋 및 브랜치 전환
- 데스크톱·태블릿·모바일 반응형 UI
- 로컬 및 원격 워크스페이스 연결
- 플러그인 기반 기능 확장

## 개발 환경

### 요구 사항

- Node.js 22 이상
- npm
- 사용할 에이전트 CLI 및 해당 계정 인증

### 실행

```bash
npm install
npm run dev
```

웹 UI는 기본적으로 `http://localhost:5173`에서, 백엔드는 `http://localhost:3001`에서 실행됩니다.

데스크톱 앱 개발 모드:

```bash
npm run client
npm run desktop:dev
```

## 검증

```bash
npm run typecheck
npm run lint
npm run build
```

## 주요 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` | 웹 클라이언트와 서버 동시 실행 |
| `npm run server:dev` | 개발 서버 실행 |
| `npm run client` | Vite 클라이언트 실행 |
| `npm run desktop:dev` | Electron 데스크톱 앱 실행 |
| `npm run typecheck` | 클라이언트·서버 타입 검사 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | 프로덕션 빌드 |
| `npm run desktop:dist:linux` | Linux 데스크톱 패키지 생성 |

## 보안

Gajae App은 로컬 파일, Git 저장소, 셸 및 에이전트 설정에 접근할 수 있습니다. 외부 네트워크에 공개할 때는 반드시 인증과 TLS를 적용하고, 신뢰할 수 없는 사용자에게 서버 포트를 노출하지 마세요.

## 프로젝트 정보

- 저장소: [devswha/gajae-app](https://github.com/devswha/gajae-app)
- 설치 및 운영: [docs/INSTALL.md](docs/INSTALL.md)
- 업스트림 계보와 변경 정책: [docs/UPSTREAM.md](docs/UPSTREAM.md)

원저작자의 저작권 고지와 라이선스는 `LICENSE` 및 `NOTICE`에 보존되어 있습니다.

## 라이선스

[GNU AGPL v3](LICENSE)
