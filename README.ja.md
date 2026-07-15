<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p><a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>、<a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a>、<a href="https://developers.openai.com/codex">Codex</a> のためのセルフホスト型ワークスペース。<br>プロジェクトとセッションを自分のマシン上で管理できます。</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub リポジトリ</a> · <a href="docs/SELF-HOST.md">セルフホストガイド</a> · <a href="https://github.com/devswha/gajae-app/issues">問題を報告</a> · <a href="CONTRIBUTING.md">コントリビュート</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <b>日本語</b> · <a href="./README.tr.md">Türkçe</a></i></div>

---

## スクリーンショット

<div align="center">

<table>
<tr>
<td align="center">
<h3>デスクトップビュー</h3>
<img src="public/screenshots/desktop-main.png" alt="デスクトップインターフェース" width="400">
<br>
<em>プロジェクト概要とチャットを表示するメイン画面</em>
</td>
<td align="center">
<h3>モバイルビュー</h3>
<img src="public/screenshots/mobile-chat.png" alt="モバイルインターフェース" width="250">
<br>
<em>タッチ操作に対応したレスポンシブデザイン</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI の選択</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI の選択" width="400">
<br>
<em>Claude Code、Cursor CLI、Codex から選択</em>
</td>
</tr>
</table>

</div>

## 機能

- **レスポンシブデザイン** — ローカルネットワーク内のデスクトップ、タブレット、モバイルで利用できます。
- **インタラクティブチャット UI** — 統合された画面でエージェントと対話できます。
- **統合シェルターミナル** — 選択したエージェントの CLI に画面からアクセスできます。
- **ファイルエクスプローラー** — 構文ハイライトを備えたプロジェクトファイルの閲覧と編集に対応します。
- **Git エクスプローラー** — 変更の確認、ステージ、コミット、ブランチの切り替えができます。
- **セッション管理** — 会話の再開、複数セッションの管理、履歴の確認ができます。
- **Skills と MCP の設定** — ローカルのエージェントに必要な拡張と接続を管理できます。
- **モデル互換性** — インストール済みのエージェントが対応する Claude と GPT のモデルファミリーを利用できます。

## クイックスタート

Gajae App はリポジトリのチェックアウトから運用します。Git と Node.js 22 が必要です。ライフサイクルマネージャーは管理対象のリビジョンをインストールし、既定ではループバックアドレスだけにバインドするユーザーサービスを起動します。

```bash
git clone https://github.com/devswha/gajae-app.git
cd gajae-app
```

チェックアウト内でライフサイクルマネージャー用の正規リポジトリ URL を設定し、確認済みのリビジョンをインストールします。

```bash
export GAJAE_APP_REPOSITORY="https://github.com/devswha/gajae-app.git"
GIT_SHA="$(git rev-parse HEAD)"
./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

完了後、`http://127.0.0.1:3001` を開いてください。インストール、移行、復旧、運用の全オプションは[セルフホストガイド](docs/SELF-HOST.md)にあります。

### 状態確認と更新

運用状態とインストール済みリビジョンの確認には、ライフサイクルマネージャーだけを使用してください。更新前に確認済みの完全なコミット SHA を選び、ロールバックに備えて現在の SHA を控えておきます。

```bash
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
GIT_SHA=<確認済みの完全なコミットSHA>
./scripts/gajae-app.sh update --ref "$GIT_SHA"
```

マネージャーは管理対象インストール内のローカル変更を上書きしません。再実行前に、その変更を意図的に確認してください。

---

## セキュリティとアクセス

この UI はホスト上でコマンドを実行できます。アクセスは SSH と同じように扱ってください。

- リモートアクセスが必要になるまで、既定の `127.0.0.1` バインドを維持してください。
- 別の端末からアクセスする場合は、認証を有効にしたまま、保護されたトンネルまたはプライベートネットワークを使用してください。
- 公開到達可能なポートを共有せず、利用できるプロジェクトとセッションを定期的に確認してください。

## FAQ

<details>
<summary>UI での変更はローカルのエージェント設定に影響しますか？</summary>

はい。Gajae App はホスト上のローカルプロジェクト、セッション、エージェント設定と連携します。権限、MCP サーバー、プロジェクトファイルの変更は、ターミナルで行う変更と同じ注意を払って確認してください。

</details>

<details>
<summary>モバイル端末でも使えますか？</summary>

はい。ローカルアクセスでは、実行中のサービスのアドレスをブラウザで開きます。別の端末からのアクセスが必要な場合は、プライベートネットワークまたは保護されたトンネルを意図的に設定してください。

</details>

<details>
<summary>以前のバージョンに戻すにはどうすればよいですか？</summary>

更新前に確認済みのコミット SHA を記録してください。以前の SHA を指定して更新し、続けてライフサイクルマネージャーで状態を確認します。詳しい復旧手順は[セルフホストガイド](docs/SELF-HOST.md)にあります。

</details>

---

## サポートとコントリビュート

- **[セルフホストガイド](docs/SELF-HOST.md)** — インストール、運用、復旧
- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — バグ報告と機能要望
- **[コントリビューションガイド](CONTRIBUTING.md)** — プロジェクトへの参加方法

## ライセンス

GNU General Public License v3.0 — 詳細は [LICENSE](LICENSE) を参照してください。

このプロジェクトはオープンソースであり、GPL v3 の下で無料で使用、変更、再配布できます。

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

## 謝辞

### 使用技術

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic の公式 CLI
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** — Cursor の公式 CLI
- **[Codex](https://developers.openai.com/codex)** — OpenAI Codex
- **[React](https://react.dev/)** — UI ライブラリ
- **[Vite](https://vitejs.dev/)** — ビルドツールと開発サーバー
- **[Tailwind CSS](https://tailwindcss.com/)** — ユーティリティファーストの CSS フレームワーク
- **[CodeMirror](https://codemirror.net/)** — コードエディタ

---

<div align="center">
 <strong>Claude Code、Cursor、Codex のコミュニティのために心を込めて作りました。</strong>
</div>
