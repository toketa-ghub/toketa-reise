/* Brücke zu Android (Capacitor). Im Browser fallen alle Funktionen auf normale Web-Mittel zurück. */
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

export async function openExternal(url) {
  if (isNative()) {
    try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }); return; } catch (e) { /* weiter */ }
  }
  window.open(url, '_blank', 'noopener');
}

/* Datei speichern: Android über Teilen-Dialog, Browser als Download */
export async function saveTextFile(name, text) {
  if (isNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const w = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: name, url: w.uri, dialogTitle: 'Sicherung speichern oder senden' });
      return true;
    } catch (e) { if (e && /cancel/i.test(String(e.message))) return false; throw e; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return true;
}

/* Zurück-Taste und Statusleiste */
export async function setupNative({ onBack }) {
  if (!isNative()) return;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => { if (!onBack()) App.minimizeApp(); });
  } catch (e) { /* ohne Zurück-Taste weiter */ }
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // helle Symbole auf dem schwarzen Kopf
  } catch (e) { /* optional */ }
}
