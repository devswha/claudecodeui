<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p><a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, <a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a>, <a href="https://developers.openai.com/codex">Codex</a>를 위한 셀프 호스팅 웹 UI입니다.<br>내 저장소 체크아웃에서 실행하여 로컬 프로젝트와 세션을 한곳에서 관리하세요.</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub</a> · <a href="docs/SELF-HOST.md">셀프 호스팅 안내</a> · <a href="https://github.com/devswha/gajae-app/issues">버그 신고</a> · <a href="CONTRIBUTING.md">기여 안내</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.de.md">Deutsch</a> · <b>한국어</b> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.tr.md">Türkçe</a></i></div>

---

## 스크린샷

<div align="center">

<table>
<tr>
<td align="center">
<h3>데스크톱 보기</h3>
<img src="public/screenshots/desktop-main.png" alt="데스크톱 인터페이스" width="400">
<br>
<em>프로젝트 개요와 채팅을 보여주는 메인 인터페이스</em>
</td>
<td align="center">
<h3>모바일 경험</h3>
<img src="public/screenshots/mobile-chat.png" alt="모바일 인터페이스" width="250">
<br>
<em>터치 내비게이션이 포함된 반응형 모바일 디자인</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI 선택</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI 선택" width="400">
<br>
<em>Claude Code, Cursor CLI 및 Codex 중 선택</em>
</td>
</tr>
</table>

</div>

## 기능

- **반응형 디자인** - 데스크톱, 태블릿, 모바일에서 일관된 UI 제공
- **대화형 채팅 인터페이스** - 내장된 채팅 UI로 에이전트와 자연스럽게 소통
- **통합 셸 터미널** - 웹 UI에서 에이전트 CLI에 직접 접근
- **파일 탐색기** - 구문 강조와 실시간 편집을 갖춘 파일 트리
- **Git 탐색기** - 변경 사항 확인, 스테이징, 커밋 및 브랜치 전환
- **세션 관리** - 대화를 재개하고 여러 세션과 기록을 관리
- **TaskMaster AI 통합** *(선택 사항)* - 작업 계획, PRD 분석, 워크플로 자동화
- **모델 호환성** - Claude 및 GPT 모델 계열 지원 (`GET /api/providers/:provider/models`에서 지원 모델 확인)

## 빠른 시작

Gajae App은 패키지 레지스트리에서 설치하는 도구가 아닙니다. 저장소 체크아웃과 저장소에 포함된 수명 주기 관리자를 사용합니다. Git, Node.js 22, 사용자 systemd 서비스가 필요합니다.

```bash
git clone https://github.com/devswha/gajae-app.git gajae-app
cd gajae-app
GIT_SHA=<승인된-전체-커밋-SHA>
./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

설치 관리자는 기본적으로 `127.0.0.1:3001`에 바인딩합니다. 브라우저에서 `http://127.0.0.1:3001`을 열고 첫 계정을 만드세요. 다른 기기에서의 접근, 인증, 바인딩 변경은 [셀프 호스팅 안내](docs/SELF-HOST.md)의 Tailscale 또는 SSH 터널 절차를 따르세요. 공용 포트 포워딩은 사용하지 마세요.

### 상태 확인 및 업데이트

승인한 변경 불가능한 전체 커밋 SHA를 기록해 두고, 업데이트 전후에 상태를 확인하세요. 수명 주기 관리자가 배포를 관리하므로 관리 중인 설치에서 수동으로 갱신하지 마세요.

```bash
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
./scripts/gajae-app.sh update --ref <승인된-전체-커밋-SHA>
```

자세한 설치, 복구, 롤백 및 보안 설정은 [셀프 호스팅 안내](docs/SELF-HOST.md)를 참조하세요.

---

## 보안 및 도구 구성

**중요 공지**: Claude Code 도구는 기본적으로 비활성화되어 있습니다. 이는 잠재적으로 유해한 작업이 자동 실행되는 것을 방지합니다.

### 도구 활성화

1. **도구 설정 열기** - 사이드바의 톱니바퀴 아이콘 클릭
2. **선택적으로 활성화** - 필요한 도구만 켜기
3. **설정 적용** - 선호도는 로컬에 저장됨

<div align="center">

![도구 설정 모달](public/screenshots/tools-modal.png)
*도구 설정 인터페이스 - 필요한 것만 켜세요*

</div>

**권장 방법**: 기본 도구부터 켜고 필요할 때만 추가하세요. 설정은 언제든지 조정할 수 있습니다.

---

## FAQ

<details>
<summary>Claude Code Remote Control과 어떻게 다른가요?</summary>

Claude Code Remote Control은 로컬 터미널에서 이미 실행 중인 세션에 메시지를 보냅니다. Gajae App은 로컬 체크아웃에서 실행되는 전체 웹 UI로, `~/.claude`의 세션을 발견하고 파일 탐색기, Git 통합, MCP 관리 및 셸 터미널을 제공합니다.

</details>

<details>
<summary>AI 구독을 별도로 결제해야 하나요?</summary>

네. Gajae App은 AI 모델이나 구독을 제공하지 않습니다. Claude, Cursor 또는 Codex 사용에 필요한 구독과 자격 증명은 직접 관리합니다.

</details>

<details>
<summary>휴대폰에서 사용할 수 있나요?</summary>

네. 기본적으로는 같은 컴퓨터의 브라우저에서 사용합니다. 다른 기기에서 접근해야 한다면 서버를 루프백에 유지하고 셀프 호스팅 안내의 Tailscale 또는 SSH 터널 방식을 사용하세요.

</details>

<details>
<summary>UI에서 변경하면 로컬 Claude Code 설정에 영향을 주나요?</summary>

네. Gajae App은 Claude Code가 사용하는 `~/.claude` 설정을 읽고 씁니다. UI에서 추가한 MCP 서버와 도구 권한 변경은 Claude Code에 반영됩니다.

</details>

---

## 지원 및 기여

- **[셀프 호스팅 안내](docs/SELF-HOST.md)** — 설치, 구성, 복구 및 보안 설정
- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — 버그 보고와 기능 요청
- **[기여 안내](CONTRIBUTING.md)** — 프로젝트 참여 방법

## 라이선스

GNU General Public License v3.0 - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

이 프로젝트는 GPL v3 라이선스 하에 공개되어 있으며, 해당 조건에 따라 사용, 수정, 배포할 수 있습니다.

## 감사의 말

### 사용 기술
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** - Anthropic 공식 CLI
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** - Cursor 공식 CLI
- **[Codex](https://developers.openai.com/codex)** - OpenAI Codex
- **[React](https://react.dev/)** - 사용자 인터페이스 라이브러리
- **[Vite](https://vitejs.dev/)** - 빌드 도구 및 개발 서버
- **[Tailwind CSS](https://tailwindcss.com/)** - 유틸리티 우선 CSS 프레임워크
- **[CodeMirror](https://codemirror.net/)** - 코드 편집기
- **TaskMaster AI** *(선택 사항)* - AI 기반 프로젝트 관리와 작업 계획

---

<div align="center">
 <strong>Claude Code, Cursor, Codex 커뮤니티를 위해 제작되었습니다.</strong>
</div>
