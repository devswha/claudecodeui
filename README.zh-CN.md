<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p>面向 <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>、<a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a> 和 <a href="https://developers.openai.com/codex">Codex</a> 的开源 Web UI，运行在您自己的机器上。<br>在浏览器中管理本地项目和活跃会话。</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub</a> · <a href="https://github.com/devswha/gajae-app/issues">报告问题</a> · <a href="CONTRIBUTING.md">贡献指南</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.ko.md">한국어</a> · <b>简体中文</b> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.tr.md">Türkçe</a></i></div>

---

## 截图

<div align="center">

<table>
<tr>
<td align="center">
<h3>桌面视图</h3>
<img src="public/screenshots/desktop-main.png" alt="桌面界面" width="400">
<br>
<em>显示项目概览和聊天的主界面</em>
</td>
<td align="center">
<h3>移动体验</h3>
<img src="public/screenshots/mobile-chat.png" alt="移动界面" width="250">
<br>
<em>支持触控导航的响应式移动设计</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI 选择</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI 选择" width="400">
<br>
<em>在 Claude Code、Cursor CLI 与 Codex 之间进行选择</em>
</td>
</tr>
</table>

</div>

## 功能

- **响应式设计** — 适用于桌面、平板和移动浏览器。
- **交互式聊天界面** — 内置聊天 UI，便于与代理顺畅交流。
- **集成 Shell 终端** — 通过内置 shell 直接访问代理 CLI。
- **文件浏览器** — 交互式文件树，支持语法高亮与实时编辑。
- **Git 浏览器** — 查看、暂存并提交更改，也可切换分支。
- **浏览器使用** — 为网页研究、测试和代理驱动的浏览器任务打开会话。
- **会话管理** — 恢复对话、管理多个会话并跟踪历史记录。
- **模型兼容性** — 支持 Claude 和 GPT 模型系列。

## 快速开始

Gajae App 仅在您自己的基础设施上运行。安装需要 Git、Node.js 22 和用户级 systemd 服务。

```sh
git clone https://github.com/devswha/gajae-app.git
cd gajae-app

GIT_SHA=<已批准的完整提交 SHA>
./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

生命周期管理器会将应用安装为指定目录中的受管 checkout，并启动本地用户服务。生产部署应使用不可变的完整提交 SHA。

在浏览器中打开 `http://127.0.0.1:3001`。Web UI 默认只绑定到 loopback 接口。

### 状态与更新

在仓库 checkout 中查看选定和正在运行的版本，或更新到已批准的版本：

```sh
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
./scripts/gajae-app.sh update --ref <已批准的完整提交 SHA>
```

更新前请记录 `status` 输出中的当前 SHA；要回退时，对先前的 SHA 使用同一条 `update --ref` 命令。受管安装的更新由生命周期管理器负责。

有关安装、回退和网络访问的详细说明，请参阅[自托管指南](docs/SELF-HOST.md)。

---

## 安全与工具配置

Web UI 能在主机上执行 shell 命令。应假定任何能访问端口且通过身份验证的人都能控制该机器。请保持默认的 loopback 绑定；需要远程访问时，使用 Tailscale 或 SSH 隧道，而不是将端口转发到公共互联网。

### 启用工具

仅在需要时启用 Claude Code 工具：

1. **打开工具设置** — 点击侧边栏中的齿轮图标。
2. **选择性启用** — 只开启必需的工具。
3. **应用设置** — 偏好设置保存在本地。

<div align="center">

![工具设置弹窗](public/screenshots/tools-modal.png)
*工具设置界面 — 只启用需要的内容*

</div>

---

## 常见问题

<details>
<summary>还需要单独支付 AI 订阅费用吗？</summary>

需要。Gajae App 提供界面和本地运行环境；您需要自行准备 Claude、Cursor 或 Codex 订阅。

</details>

<details>
<summary>可以在手机上使用 Gajae App 吗？</summary>

可以。请从受信任网络中的浏览器访问，或使用安全的 Tailscale、SSH 隧道；不要将应用绑定到公开端口。

</details>

<details>
<summary>在 UI 中进行的更改会影响本地 Claude Code 配置吗？</summary>

会。UI 读取并写入 Claude Code 使用的本地配置；通过 UI 添加的 MCP 服务器和工具权限也会应用于 Claude Code。

</details>

---

## 社区与支持

- **[Gajae App 仓库](https://github.com/devswha/gajae-app)** — 源代码和版本历史。
- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — 报告问题和提出功能建议。
- **[贡献指南](CONTRIBUTING.md)** — 了解如何参与项目贡献。

## 许可证

GNU Affero General Public License v3.0 或更高版本（AGPL-3.0-or-later）——完整文本及第 7 条下的附加条款见 [LICENSE](LICENSE)。

本项目是开源软件，可在 AGPL-3.0-or-later 许可证下自由使用、修改和分发。若您修改本软件并将其作为网络服务运行，必须向该服务的用户提供修改后的源代码。

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

## 致谢

### 使用技术

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic 官方 CLI。
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** — Cursor 官方 CLI。
- **[Codex](https://developers.openai.com/codex)** — OpenAI Codex。
- **[React](https://react.dev/)** — 用户界面库。
- **[Vite](https://vitejs.dev/)** — 快速构建工具和开发服务器。
- **[Tailwind CSS](https://tailwindcss.com/)** — 实用优先的 CSS 框架。
- **[CodeMirror](https://codemirror.net/)** — 高级代码编辑器。

---

<div align="center">
 <strong>为 Claude Code、Cursor 和 Codex 社区精心打造。</strong>
</div>
