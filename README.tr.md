<div align="center">
 <img src="public/logo.svg" alt="Gajae App" width="64" height="64">
 <h1>Gajae App</h1>
 <p><a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, <a href="https://docs.cursor.com/en/cli/overview">Cursor CLI</a> ve <a href="https://developers.openai.com/codex">Codex</a> için kendi makinenizde çalışan açık kaynak web arayüzü.<br>Yerel projelerinizi ve etkin oturumlarınızı tarayıcıdan yönetin.</p>
</div>

<p align="center">
 <a href="https://github.com/devswha/gajae-app">GitHub</a> · <a href="https://github.com/devswha/gajae-app/issues">Sorun Bildir</a> · <a href="CONTRIBUTING.md">Katkıda Bulun</a>
</p>

<div align="right"><i><a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <b>Türkçe</b></i></div>

---

## Ekran Görüntüleri

<div align="center">

<table>
<tr>
<td align="center">
<h3>Masaüstü Görünümü</h3>
<img src="public/screenshots/desktop-main.png" alt="Masaüstü Arayüzü" width="400">
<br>
<em>Proje genel bakışını ve sohbeti gösteren ana arayüz</em>
</td>
<td align="center">
<h3>Mobil Deneyim</h3>
<img src="public/screenshots/mobile-chat.png" alt="Mobil Arayüz" width="250">
<br>
<em>Dokunma gezinmesine sahip duyarlı mobil tasarım</em>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<h3>CLI Seçimi</h3>
<img src="public/screenshots/cli-selection.png" alt="CLI Seçimi" width="400">
<br>
<em>Claude Code, Cursor CLI ve Codex arasında seçim yapın</em>
</td>
</tr>
</table>

</div>

## Özellikler

- **Duyarlı Tasarım** — Masaüstü, tablet ve mobil tarayıcılarda çalışır.
- **Etkileşimli Sohbet Arayüzü** — Ajanlarla akıcı iletişim için yerleşik sohbet arayüzü.
- **Entegre Shell Terminali** — Yerleşik shell üzerinden ajan CLI'larına doğrudan erişim.
- **Dosya Gezgini** — Sözdizimi vurgulama ve canlı düzenleme içeren etkileşimli dosya ağacı.
- **Git Gezgini** — Değişiklikleri görüntüleyin, stage'e alın, commit'leyin ve dallar arasında geçin.
- **Tarayıcı Kullanımı** — Web araştırması, test ve ajan destekli tarayıcı görevleri için oturumlar açın.
- **Oturum Yönetimi** — Konuşmaları sürdürün, birden çok oturumu yönetin ve geçmişi takip edin.
- **Model Uyumluluğu** — Claude ve GPT model aileleriyle çalışır.

## Hızlı Başlangıç

Gajae App yalnızca kendi altyapınızda çalışır. Kurulum için Git, Node.js 22 ve kullanıcı düzeyinde systemd hizmetleri gerekir.

```sh
git clone https://github.com/devswha/gajae-app.git
cd gajae-app

GIT_SHA=<onaylanmış-tam-commit-sha>
./scripts/gajae-app.sh install \
  --ref "$GIT_SHA" \
  --port 3001 \
  --install-dir "$HOME/.local/share/gajae-app"
```

Yaşam döngüsü yöneticisi uygulamayı belirtilen dizinde yönetilen bir checkout olarak kurar ve yerel kullanıcı hizmetini başlatır. Üretim kurulumlarında değiştirilemez, tam bir commit SHA'sı kullanın.

Tarayıcıda `http://127.0.0.1:3001` adresini açın. Web arayüzü varsayılan olarak yalnızca loopback arabirimine bağlanır.

### Durum ve Güncelleme

Kurulum dizininden uygulamanın seçilen ve çalışan sürümünü inceleyin ya da onaylanmış bir sürüme güncelleyin:

```sh
./scripts/gajae-app.sh status
./scripts/gajae-app.sh status --json
./scripts/gajae-app.sh update --ref <onaylanmış-tam-commit-sha>
```

Güncellemeden önce `status` çıktısındaki geçerli SHA'yı kaydedin; önceki SHA'ya dönmek için aynı `update --ref` komutunu kullanın. Yönetilen kurulumun güncellemelerini yaşam döngüsü yöneticisi yürütür.

Ayrıntılı kurulum, geri alma ve ağ erişimi yönergeleri için [kendi barındırma rehberine](docs/SELF-HOST.md) bakın.

---

## Güvenlik ve Araç Yapılandırması

Web arayüzü ana makinede shell komutları çalıştırabilir. Porta erişebilen ve kimliği doğrulanan herkesin makineyi denetleyebileceğini varsayın. Varsayılan loopback bağlamasını koruyun; uzaktan erişim gerektiğinde açık internet port yönlendirmesi yerine Tailscale veya SSH tüneli kullanın.

### Araçları Etkinleştirme

Claude Code araçlarını yalnızca ihtiyaç duyduğunuzda etkinleştirin:

1. **Araç Ayarlarını Açın** — Kenar çubuğundaki dişli simgesini seçin.
2. **Seçerek Etkinleştirin** — Yalnızca gerekli araçları açın.
3. **Ayarları Uygulayın** — Tercihler yerel olarak kaydedilir.

<div align="center">

![Araç Ayarları Modalı](public/screenshots/tools-modal.png)
*Araç ayarları arayüzü — yalnızca ihtiyacınız olanı etkinleştirin*

</div>

---

## Sık Sorulan Sorular

<details>
<summary>AI aboneliği için ayrıca ödeme yapmam gerekir mi?</summary>

Evet. Gajae App bir arayüz ve yerel çalışma ortamı sağlar; Claude, Cursor veya Codex aboneliğinizi kendiniz sağlarsınız.

</details>

<details>
<summary>Gajae App'i telefonumda kullanabilir miyim?</summary>

Evet. Güvenilir ağınızdaki bir tarayıcıdan veya güvenli bir Tailscale ya da SSH tüneli üzerinden erişin. Uygulamayı açık bir genel porta bağlamayın.

</details>

<details>
<summary>Arayüzde yaptığım değişiklikler yerel Claude Code yapılandırmamı etkiler mi?</summary>

Evet. Arayüz, Claude Code'un kullandığı yerel yapılandırmayı okur ve yazar; arayüzden eklediğiniz MCP sunucuları ve araç izinleri Claude Code'da da uygulanır.

</details>

---

## Topluluk ve Destek

- **[Gajae App deposu](https://github.com/devswha/gajae-app)** — kaynak kodu ve sürüm geçmişi.
- **[GitHub Issues](https://github.com/devswha/gajae-app/issues)** — hata raporları ve özellik istekleri.
- **[Katkı Rehberi](CONTRIBUTING.md)** — projeye nasıl katkıda bulunulacağı.

## Lisans

GNU Affero General Public License v3.0 veya sonrası (AGPL-3.0-or-later) — tam metin ve Bölüm 7 altındaki ek şartlar için [LICENSE](LICENSE) dosyasına bakın.

Bu proje açık kaynaklıdır ve AGPL-3.0-or-later lisansı altında özgürce kullanılabilir, değiştirilebilir ve dağıtılabilir. Bu yazılımı değiştirir ve bir ağ servisi olarak çalıştırırsanız, değiştirilmiş kaynak kodunu o servisin kullanıcılarına sunmanız gerekir.

<!-- upstream-lineage:start -->
Upstream lineage: Gajae App is derived from [CloudCLI UI](https://github.com/siteboon/claudecodeui). Required attribution and license terms are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- upstream-lineage:end -->

## Teşekkürler

### Kullanılan Teknolojiler

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic'in resmi CLI'ı.
- **[Cursor CLI](https://docs.cursor.com/en/cli/overview)** — Cursor'un resmi CLI'ı.
- **[Codex](https://developers.openai.com/codex)** — OpenAI Codex.
- **[React](https://react.dev/)** — Kullanıcı arayüzü kütüphanesi.
- **[Vite](https://vitejs.dev/)** — Hızlı derleme aracı ve geliştirme sunucusu.
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first CSS framework.
- **[CodeMirror](https://codemirror.net/)** — Gelişmiş kod editörü.

---

<div align="center">
 <strong>Claude Code, Cursor ve Codex topluluğu için özenle yapıldı.</strong>
</div>
