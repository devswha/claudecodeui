<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p>適用於 <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>、<a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a> 與 <a href="https://developers.openai.com/codex">Codex</a> 的自架式桌面與行動裝置 UI。在自己的機器上管理專案和工作階段。</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub 儲存庫</a> · <a href="docs/SELF-HOST.md">自架指南</a> · <a href="https://github.com/devswha/gajae-app/issues">問題回報</a> · <a href="CONTRIBUTING.md">貢獻指南</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.zh-CN.md">简体中文</a> · <b>繁體中文</b> · <a href="./README.ja.md">日本語</a> · <a href="./README.tr.md">Türkçe</a></i></div>

---

## 截圖

<div align="center">

<table>
<tr>
<td align="center">
<h3>桌面檢視</h3>
<img src="public/screenshots/desktop-main.png" alt="桌面介面" width="400">
<br>
<em>顯示專案總覽和聊天的主介面</em>
</td>
<td align="center">
<h3>行動裝置體驗</h3>
<img src="public/screenshots/mobile-chat.png" alt="行動裝置介面" width="250">
<br>
<em>具有觸控導覽的響應式行動裝置設計</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI 選擇</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI 選擇" width="400">
<br>
<em>在 Claude Code、Cursor CLI 與 Codex 之間進行選擇</em>
</td>
</tr>
</table>

</div>

## 功能

- **響應式設計** — 在桌面、平板和行動裝置上順暢運作
- **互動聊天介面** — 內建聊天 UI，方便與 Agents 協作
- **整合 Shell 終端機** — 透過內建 shell 直接存取 Agents CLI
- **檔案瀏覽器** — 互動式檔案樹，支援語法醒目提示與即時編輯
- **Git 瀏覽器** — 檢視、暫存及提交變更，並可切換分支
- **瀏覽器使用** — 開啟瀏覽器工作階段，進行網頁研究、測試及代理驅動的瀏覽器工作
- **工作階段管理** — 恢復對話、管理多個工作階段並追蹤歷史紀錄
- **整合擴充** — 以工作區整合和自訂分頁擴充工作流程
- **模型相容性** — 支援 Claude 與 GPT 模型家族；執行時可透過 `GET /api/providers/:provider/models` 取得完整支援清單

## 快速開始

### 自架 Gajae App

Gajae App 由此儲存庫的生命週期指令碼管理。需要 Git 與 Node.js 22 或更新版本；請以已核准、不可變的提交 SHA 安裝。

```bash
git clone https://github.com/devswha/gajae-app.git
cd gajae-app
GIT_SHA=<approved-full-commit-sha>
GAJAE_APP_REPOSITORY=https://github.com/devswha/gajae-app.git \
  ./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

安裝後開啟 `http://127.0.0.1:3001`。預設只繫結 loopback；從其他裝置存取時，請依照[自架指南](docs/SELF-HOST.md)使用 Tailscale 或 SSH 通道，而非公開轉送連接埠。

管理既有安裝或更新時，使用同一個儲存庫指令碼：

```bash
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
./scripts/gajae-app.sh update --ref <approved-full-commit-sha>
```

如需服務管理、設定、遠端存取及復原步驟，請閱讀完整的[自架指南](docs/SELF-HOST.md)。

---

## 安全與工具設定

**重要提示**：此 UI 可在主機上執行 shell 指令。請將其連接埠視為 SSH 連接埠：能通過驗證並連線的人可控制該機器。除非明確需要遠端存取，否則請維持 loopback 繫結。

### 啟用工具

1. **開啟工具設定** — 點擊側邊欄齒輪圖示
2. **選擇性啟用** — 僅啟用工作所需的工具
3. **套用設定** — 偏好設定會儲存在本機

<div align="center">

![工具設定彈出視窗](public/screenshots/tools-modal.png)
*工具設定介面 — 只啟用你需要的內容*

</div>

**建議做法**：從最少權限開始，僅在工作需要時新增工具，並定期檢查設定。

---

## 常見問題

<details>
<summary>與 Claude Code Remote Control 有何不同？</summary>

Claude Code Remote Control 讓你傳送訊息到本機終端機中已經執行的工作階段。該方式要求你的機器與終端機保持開啟，沒有網路連線時工作階段可能會逾時。

Gajae App 會讀取與寫入 Claude Code 使用的設定和工作階段，並提供聊天、檔案瀏覽、Git 整合、MCP 管理和 Shell 終端機等完整 UI。

- **涵蓋全部工作階段** — 自動掃描 `~/.claude` 資料夾中的工作階段
- **設定統一** — 在 UI 變更的 MCP、工具權限及專案設定會立即寫入 Claude Code 設定
- **支援更多 Agents** — Claude Code、Cursor CLI 與 Codex
- **完整 UI** — 內建檔案瀏覽器、Git 整合、MCP 管理與 Shell 終端機

</details>

<details>
<summary>需要額外購買 AI 訂閱嗎？</summary>

需要。Gajae App 不提供 AI 模型或訂閱；請使用自己的 Claude、Cursor 或 Codex 訂閱。

</details>

<details>
<summary>能在手機上使用 Gajae App 嗎？</summary>

可以。在主機上執行服務後，依照[自架指南](docs/SELF-HOST.md)透過 Tailscale 或 SSH 通道從行動裝置瀏覽器連線。請勿將服務直接公開至網際網路。

</details>

<details>
<summary>UI 中的變更會影響本機 Claude Code 設定嗎？</summary>

會。Gajae App 讀取並寫入 Claude Code 使用的 `~/.claude` 設定。透過 UI 新增的 MCP 伺服器會立即在 Claude Code 中可見。

</details>

---

## 社群與支援

- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — 回報 Bug 與建議功能
- **[貢獻指南](CONTRIBUTING.md)** — 如何參與專案貢獻
- **[自架指南](docs/SELF-HOST.md)** — 安裝、設定、服務管理與疑難排解

## 授權條款

GNU Affero 通用公共授權條款 v3.0 或更新版本（AGPL-3.0-or-later）— 詳見 [LICENSE](LICENSE) 檔案，包括 LICENSE 第 7 節的附加條款。

本專案為開源軟體，可依 AGPL-3.0-or-later 授權條款自由使用、修改與散布。若修改本軟體並將其作為網路服務執行，必須向該服務的使用者提供修改後的原始碼。

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

## 致謝

### 使用技術
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic 官方 CLI
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** — Cursor 官方 CLI
- **[Codex](https://developers.openai.com/codex)** — OpenAI Codex
- **[React](https://react.dev/)** — 使用者介面函式庫
- **[Vite](https://vitejs.dev/)** — 快速建構工具與開發伺服器
- **[Tailwind CSS](https://tailwindcss.com/)** — 實用優先 CSS 框架
- **[CodeMirror](https://codemirror.net/)** — 進階程式碼編輯器
- **[TaskMaster AI](https://github.com/eyaltoledano/claude-task-master)** *(選用)* — AI 驅動的專案管理與任務規劃

---

<div align="center">
 <strong>為 Claude Code、Cursor 和 Codex 社群精心打造。</strong>
</div>
