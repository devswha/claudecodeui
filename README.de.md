<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p>Ein selbst gehosteter Arbeitsbereich für <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, <a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a> und <a href="https://developers.openai.com/codex">Codex</a>.<br>Verwalte Projekte und Sitzungen direkt auf deinem eigenen Rechner.</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub-Repository</a> · <a href="docs/SELF-HOST.md">Self-Hosting-Anleitung</a> · <a href="https://github.com/devswha/gajae-app/issues">Probleme melden</a> · <a href="CONTRIBUTING.md">Mitwirken</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a> · <b>Deutsch</b> · <a href="./README.ko.md">한국어</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.tr.md">Türkçe</a></i></div>

---

## Screenshots

<div align="center">

<table>
<tr>
<td align="center">
<h3>Desktop-Ansicht</h3>
<img src="public/screenshots/desktop-main.png" alt="Desktop-Oberfläche" width="400">
<br>
<em>Hauptoberfläche mit Projektübersicht und Chat</em>
</td>
<td align="center">
<h3>Mobile Ansicht</h3>
<img src="public/screenshots/mobile-chat.png" alt="Mobile-Oberfläche" width="250">
<br>
<em>Responsives Design mit Touch-Navigation</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI-Auswahl</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI-Auswahl" width="400">
<br>
<em>Wähle Claude Code, Cursor CLI oder Codex</em>
</td>
</tr>
</table>

</div>

## Funktionen

- **Responsives Design** – Arbeite auf Desktop, Tablet oder Mobilgerät in deinem lokalen Netzwerk.
- **Interaktiver Chat** – Kommuniziere mit Agenten in einer integrierten Oberfläche.
- **Integriertes Shell-Terminal** – Greife über die Oberfläche auf die CLI des gewählten Agenten zu.
- **Datei-Explorer** – Durchsuche und bearbeite Projektdateien mit Syntaxhervorhebung.
- **Git-Explorer** – Prüfe Änderungen, stage und committe sie und wechsle Branches.
- **Sitzungsverwaltung** – Setze Gespräche fort, verwalte mehrere Sitzungen und behalte den Verlauf im Blick.
- **Skills und MCP-Konfiguration** – Verwalte die für deine lokalen Agenten benötigten Erweiterungen und Verbindungen.
- **Modell-Kompatibilität** – Nutze die Claude- und GPT-Modellfamilien, die deine installierten Agenten unterstützen.

## Schnellstart

Gajae App wird aus einem Repository-Checkout betrieben. Du benötigst Git und Node.js 22. Der Lifecycle-Manager installiert eine verwaltete Revision und startet einen Benutzer-Service, der standardmäßig nur an die Loopback-Adresse gebunden ist.

```bash
git clone https://github.com/devswha/gajae-app.git
cd gajae-app
```

Im Checkout die kanonische Repository-URL für den Lifecycle-Manager setzen und eine geprüfte Revision installieren:

```bash
export GAJAE_APP_REPOSITORY="https://github.com/devswha/gajae-app.git"
GIT_SHA="$(git rev-parse HEAD)"
./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

Öffne anschließend `http://127.0.0.1:3001`. Die vollständigen Optionen für Installation, Migration, Wiederherstellung und Betrieb stehen in der [Self-Hosting-Anleitung](docs/SELF-HOST.md).

### Status und Aktualisierung

Verwende für den Betriebszustand und die installierte Revision ausschließlich den Lifecycle-Manager. Wähle vor einer Aktualisierung einen geprüften, vollständigen Commit-SHA und bewahre den bisher verwendeten SHA für einen möglichen Rollback auf.

```bash
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
GIT_SHA=<geprüfter-vollständiger-Commit-SHA>
./scripts/gajae-app.sh update --ref "$GIT_SHA"
```

Der Manager überschreibt keine lokalen Änderungen in der verwalteten Installation. Prüfe solche Änderungen bewusst, bevor du den Vorgang erneut ausführst.

---

## Sicherheit und Zugriff

Die Oberfläche kann Befehle auf dem Host ausführen. Behandle ihren Zugriff daher wie SSH:

- Lass die Standardbindung an `127.0.0.1` bestehen, solange kein Fernzugriff erforderlich ist.
- Verwende für Fernzugriff einen abgesicherten Tunnel oder ein privates Netzwerk und behalte die Authentifizierung aktiviert.
- Teile keine öffentlich erreichbaren Ports und überprüfe regelmäßig, welche Projekte und Sitzungen verfügbar sind.

## FAQ

<details>
<summary>Wirkt sich die Oberfläche auf meine lokale Agenten-Konfiguration aus?</summary>

Ja. Gajae App arbeitet mit den lokalen Projekten, Sitzungen und Agenten-Konfigurationen auf dem Host. Prüfe Änderungen an Berechtigungen, MCP-Servern und Projektdateien so sorgfältig wie Änderungen in einem Terminal.

</details>

<details>
<summary>Kann ich sie auf einem Mobilgerät verwenden?</summary>

Ja. Für den lokalen Zugriff öffnest du die Adresse des laufenden Dienstes in einem Browser. Wenn Zugriff von einem anderen Gerät nötig ist, richte ihn bewusst über ein privates Netzwerk oder einen abgesicherten Tunnel ein.

</details>

<details>
<summary>Wie stelle ich eine frühere Version wieder her?</summary>

Notiere vor jedem Update den geprüften Commit-SHA. Aktualisiere dann mit dem zuvor verwendeten SHA und prüfe anschließend den Status über den Lifecycle-Manager. Die [Self-Hosting-Anleitung](docs/SELF-HOST.md) beschreibt die Wiederherstellung im Detail.

</details>

---

## Unterstützung und Mitwirkung

- **[Self-Hosting-Anleitung](docs/SELF-HOST.md)** — Installation, Betrieb und Wiederherstellung
- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — Fehlerberichte und Funktionswünsche
- **[Beitragsrichtlinien](CONTRIBUTING.md)** — So wirkst du am Projekt mit

## Lizenz

GNU General Public License v3.0 – Details stehen in der Datei [LICENSE](LICENSE).

Dieses Projekt ist Open Source und darf unter der GPL v3 kostenlos verwendet, verändert und weitergegeben werden.

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

## Danksagungen

### Erstellt mit

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** – Anthropics offizielle CLI
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** – Cursors offizielle CLI
- **[Codex](https://developers.openai.com/codex)** – OpenAI Codex
- **[React](https://react.dev/)** – UI-Bibliothek
- **[Vite](https://vitejs.dev/)** – Build-Tool und Entwicklungsserver
- **[Tailwind CSS](https://tailwindcss.com/)** – Utility-first-CSS-Framework
- **[CodeMirror](https://codemirror.net/)** – Code-Editor

---

<div align="center">
 <strong>Mit Sorgfalt für die Claude Code-, Cursor- und Codex-Community erstellt.</strong>
</div>
