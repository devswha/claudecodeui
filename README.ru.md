<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p>Самостоятельно размещаемый веб-интерфейс для <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, <a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a> и <a href="https://developers.openai.com/codex">Codex</a>.<br>Запускайте его из локальной копии репозитория и управляйте проектами и сессиями в одном месте.</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub</a> · <a href="docs/SELF-HOST.md">Руководство по самостоятельному размещению</a> · <a href="https://github.com/devswha/gajae-app/issues">Сообщить об ошибке</a> · <a href="CONTRIBUTING.md">Участие в разработке</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <b>Русский</b> · <a href="./README.de.md">Deutsch</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.tr.md">Türkçe</a></i></div>

---

## Скриншоты

<div align="center">

<table>
<tr>
<td align="center">
<h3>Версия для десктопа</h3>
<img src="public/screenshots/desktop-main.png" alt="Интерфейс для десктопа" width="400">
<br>
<em>Основной интерфейс с обзором проекта и чатом</em>
</td>
<td align="center">
<h3>Мобильный режим</h3>
<img src="public/screenshots/mobile-chat.png" alt="Мобильный интерфейс" width="250">
<br>
<em>Адаптивный мобильный дизайн с сенсорной навигацией</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>Выбор CLI</h3>
<img src="public/screenshots/cli-selection.png" alt="Выбор CLI" width="400">
<br>
<em>Выбирайте между Claude Code, Cursor CLI и Codex</em>
</td>
</tr>
</table>

</div>

## Возможности

- **Адаптивный дизайн** — единый интерфейс на десктопе, планшете и телефоне
- **Интерактивный чат** — встроенный чат для работы с агентами
- **Интегрированный shell-терминал** — прямой доступ к CLI агентов из веб-интерфейса
- **Проводник файлов** — дерево файлов с подсветкой синтаксиса и редактированием в реальном времени
- **Git Explorer** — просмотр изменений, stage, commit и переключение веток
- **Управление сессиями** — возобновление диалогов, несколько сессий и история
- **Интеграция с TaskMaster AI** *(опционально)* — планирование задач, разбор PRD и автоматизация workflow
- **Совместимость с моделями** — поддержка семейств моделей Claude и GPT (список доступен через `GET /api/providers/:provider/models`)

## Быстрый старт

Gajae App не устанавливается из реестра пакетов. Используйте копию репозитория и включённый в неё менеджер жизненного цикла. Требуются Git, Node.js 22 и пользовательская служба systemd.

```bash
git clone https://github.com/devswha/gajae-app.git gajae-app
cd gajae-app
GIT_SHA=<утверждённый-полный-SHA-коммита>
./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

Менеджер установки по умолчанию привязывается к `127.0.0.1:3001`. Откройте `http://127.0.0.1:3001` в браузере и создайте первую учётную запись. Для доступа с другого устройства, аутентификации или изменения привязки используйте Tailscale либо SSH-туннель из [руководства по самостоятельному размещению](docs/SELF-HOST.md). Не используйте публичный проброс портов.

### Состояние и обновления

Сохраняйте утверждённый неизменяемый полный SHA коммита и проверяйте состояние до и после обновления. Менеджер жизненного цикла управляет развёртыванием, поэтому не обновляйте управляемую установку вручную.

```bash
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
./scripts/gajae-app.sh update --ref <утверждённый-полный-SHA-коммита>
```

Подробности установки, восстановления, отката и настройки безопасности приведены в [руководстве по самостоятельному размещению](docs/SELF-HOST.md).

---

## Безопасность и конфигурация инструментов

**Важное примечание**: инструменты Claude Code по умолчанию отключены. Это предотвращает автоматический запуск потенциально опасных операций.

### Включение инструментов

1. **Откройте настройки инструментов** — нажмите значок шестерёнки в боковой панели.
2. **Включайте выборочно** — активируйте только нужные инструменты.
3. **Примените настройки** — предпочтения сохраняются локально.

<div align="center">

![Окно настроек инструментов](public/screenshots/tools-modal.png)
*Интерфейс настройки инструментов — включайте только то, что вам нужно*

</div>

**Рекомендуемый подход**: начните с базовых инструментов и добавляйте остальные только по необходимости. Настройки можно изменить в любой момент.

---

## FAQ

<details>
<summary>Чем это отличается от Claude Code Remote Control?</summary>

Claude Code Remote Control отправляет сообщения в сессию, уже запущенную в локальном терминале. Gajae App — это полный веб-интерфейс, который запускается из локальной копии репозитория, находит сессии из `~/.claude` и предоставляет проводник файлов, Git-интеграцию, управление MCP и shell-терминал.

</details>

<details>
<summary>Нужно ли отдельно платить за AI-подписку?</summary>

Да. Gajae App не предоставляет модели или подписки. Вы самостоятельно управляете подписками и учётными данными, необходимыми для Claude, Cursor или Codex.

</details>

<details>
<summary>Можно ли пользоваться приложением с телефона?</summary>

Да. По умолчанию приложение используется из браузера на той же машине. Для доступа с другого устройства оставьте сервер на loopback и настройте Tailscale или SSH-туннель по руководству по самостоятельному размещению.

</details>

<details>
<summary>Повлияют ли изменения в UI на локальный Claude Code?</summary>

Да. Gajae App читает и записывает настройки `~/.claude`, используемые Claude Code. Добавленные через UI MCP-серверы и изменения разрешений инструментов применяются в Claude Code.

</details>

---

## Поддержка и участие

- **[Руководство по самостоятельному размещению](docs/SELF-HOST.md)** — установка, настройка, восстановление и безопасность
- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — сообщения об ошибках и запросы новых возможностей
- **[Руководство для контрибьюторов](CONTRIBUTING.md)** — как участвовать в развитии проекта

## Лицензия

GNU General Public License v3.0 — подробности в файле [LICENSE](LICENSE).

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

Проект распространяется по лицензии GPL v3; в её рамках его можно использовать, изменять и распространять.

## Благодарности

### Используется
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — официальный CLI от Anthropic
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** — официальный CLI от Cursor
- **[Codex](https://developers.openai.com/codex)** — OpenAI Codex
- **[React](https://react.dev/)** — библиотека пользовательских интерфейсов
- **[Vite](https://vitejs.dev/)** — инструмент сборки и dev-сервер
- **[Tailwind CSS](https://tailwindcss.com/)** — utility-first CSS framework
- **[CodeMirror](https://codemirror.net/)** — редактор кода
- **TaskMaster AI** *(опционально)* — управление проектами и планирование задач на базе AI

---

<div align="center">
 <strong>Создано для сообщества Claude Code, Cursor и Codex.</strong>
</div>
