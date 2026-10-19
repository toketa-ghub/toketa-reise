# Toketa Reise

Reiseplaner im Toketa-Design: Reiseplan pro Tag, Checkliste, Todos & Wünsche, Budget, Infos, Notizen.
Läuft als Web-App (PC) und als Android-App (Capacitor). Reisen werden über Firebase (Anmeldung + Firestore) zwischen den Geräten abgeglichen.

- `src/` Oberfläche (Vanilla JS, Vite), `src/sync.js` Firebase, `src/store.js` lokaler Speicher
- `android/` Android-Projekt (wird mit `npx cap sync android` aktualisiert)
- `.github/workflows/android.yml` baut die signierte APK, `hosting.yml` veröffentlicht die Web-Version
- Benötigte GitHub-Geheimnisse: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `FIREBASE_SERVICE_ACCOUNT`

## Lizenz

Kein Open Source. Quellcode zur Ansicht öffentlich; Nutzung der Apps privat und kostenlos erlaubt. Kopieren, Weitergeben, eigene Versionen und kommerzielle Nutzung nur mit schriftlicher Erlaubnis (alex@toketa.de). Details in `LICENSE`, Fremdkomponenten in `THIRD-PARTY-NOTICES.txt`.
