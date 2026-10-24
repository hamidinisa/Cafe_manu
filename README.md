# Roast & Craft — %100 Yüzdelik Akışkan Dijital Kafe Menüsü, Güvenli Admin & GitHub + Docker Paketi

Bu proje, yerel ağdaki (Wi-Fi / LAN) veya buluttaki tüm cihazlardan (telefon, tablet, mutfak ekranı ve geniş ekran TV/kiosk) bozulmadan erişilebilen **%100 yüzdelik (`%`) akışkan (fluid) menü paneline**, **OWASP güvenlik standartlarına** ve **GitHub CI/CD entegrasyonuna** sahiptir.

## 1. Yüzdelik (%) Ekran Uyumu (Sıfır Bozulma)
- **Ana Kapsayıcı:** `width: 94%` (`max-width: 96%`) ile her ekran genişliğine göre esner.
- **Mobil (`<640px`):** Her ürün kartı `%100` genişlik kaplar (`flex: 0 0 100%`).
- **Tablet (`640px–1023px`):** Her satırda 2 ürün kartı (`%48.8` kart + `%2.4` boşluk = `%100`).
- **Masaüstü (`1024px–1439px`):** Her satırda 3 ürün kartı (`%32` kart + `2 × %2` boşluk = `%100`).
- **Geniş Ekran / Kiosk (`1440px+`):** Her satırda 4 ürün kartı (`%23.5` kart + `3 × %2` boşluk = `%100`).
- **Görsel Oranı:** `padding-top: 62.5%` (16:10 yüzdelik oran) sayesinde görseller hiçbir cihazda sünmez veya kırpılma bozukluğu yaşamaz.

## 2. GitHub'a Tek Komutla Entegrasyon (`Cafe_manu`)
Linux / macOS:
```bash
chmod +x git_push.sh
./git_push.sh <GITHUB_KULLANICI_ADINIZ> Cafe_manu main
```
Windows:
```cmd
git_push.bat <GITHUB_KULLANICI_ADINIZ> Cafe_manu main
```
Her `git push` sonrasında `.github/workflows/deploy.yml` devreye girerek:
1. Güvenlik taramasını çalıştırır,
2. Docker imajını `ghcr.io` üzerinde derler,
3. Yüzdelik menü arayüzünü **GitHub Pages** üzerinde yayınlar.

## 3. Docker Compose ile Çoklu Cihaz Kurulumu
```bash
cp .env.example .env
docker compose up -d --build
```
Aynı Wi-Fi ağındaki tüm cihazlar `http://<BILGISAYAR-IP>:8080` adresinden erişebilir.
